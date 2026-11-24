import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'
import express from 'express'
import multer from 'multer'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) })

const app = express()
const port = Number(process.env.PORT) || 3001
const maxFiles = 10
const maxFileBytes = 8 * 1024 * 1024
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: maxFiles, fileSize: maxFileBytes, fields: 0 },
  fileFilter(_req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new UploadError('Only JPEG, PNG, and WebP images are supported.', 415, 'UNSUPPORTED_IMAGE'))
    }
    callback(null, true)
  },
})

class UploadError extends Error {
  constructor(message, status = 400, code = 'INVALID_UPLOAD') {
    super(message)
    this.status = status
    this.code = code
  }
}

function isValidImageSignature(file) {
  const bytes = file.buffer
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (file.mimetype === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  return false
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const nullableInteger = { anyOf: [{ type: 'integer' }, { type: 'null' }] }
const responseJsonSchema = {
  type: 'object',
  properties: {
    screenshots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          screenshotIndex: { type: 'integer' },
          date: nullableString,
          totalScreenTimeMinutes: nullableInteger,
          apps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                appName: nullableString,
                durationMinutes: nullableInteger,
                displayedDuration: nullableString,
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                uncertain: { type: 'boolean' },
              },
              required: ['appName', 'durationMinutes', 'displayedDuration', 'confidence', 'uncertain'],
            },
          },
        },
        required: ['screenshotIndex', 'date', 'totalScreenTimeMinutes', 'apps'],
      },
    },
  },
  required: ['screenshots'],
}

const analysisPrompt = `Inspect each attached image as a separate screen-time or app-usage screenshot. Return one screenshots entry for every image, in the same order, and set screenshotIndex to its 1-based position. Extract only values visibly shown: date (preserve the visible date text), overall total screen time in integer minutes, and each visible app's name and usage duration in integer minutes. Preserve the displayed duration text too. Never calculate or infer a missing value, date, app name, or duration. Use null when absent or unreadable. If a row is partly unreadable, include it with null for unreadable fields and uncertain=true. Use confidence low or medium when any extracted value is unclear; otherwise high. Do not combine entries from different screenshots, infer totals from app rows, or give recommendations. If an image is not a screen-time/app-usage report, return an empty apps list and null date and total.`

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
}))

app.post('/api/test-gemini', async (_req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini is not configured on the server.' })
  }
  const startedAt = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      contents: 'Reply with exactly: Gemini connection successful.',
      config: {
        abortSignal: controller.signal,
        httpOptions: { timeout: 20_000, retryOptions: { attempts: 1 } },
      },
    })
    console.info(`[test-gemini] durationMs=${Math.round(performance.now() - startedAt)} upstreamStatus=200`)
    return res.json({ response: result.text ?? '' })
  } catch (error) {
    const status = Number(error?.status ?? error?.httpStatus)
    const durationMs = Math.round(performance.now() - startedAt)
    const upstreamStatus = Number.isInteger(status) && status > 0 ? status : null
    console.info(`[test-gemini] durationMs=${durationMs} upstreamStatus=${upstreamStatus ?? 'unavailable'}`)
    if (controller.signal.aborted || error?.name === 'AbortError') {
      return res.status(504).json({
        error: {
          code: 'GEMINI_TIMEOUT',
          message: 'Gemini did not respond within 20 seconds. No automatic retry was made.',
          upstreamStatus,
        },
      })
    }
    if (status === 401 || status === 403) {
      return res.status(502).json({
        error: {
          code: 'GEMINI_AUTH_FAILED',
          message: 'Gemini rejected the configured key (HTTP 401). Re-copy or create a Gemini API key in Google AI Studio, update server/.env, and restart the server.',
          upstreamStatus,
        },
      })
    }
    if (status === 429 || /quota|resource[_ ]exhausted|rate limit/i.test(String(error?.message ?? ''))) {
      return res.status(429).json({ error: { code: 'GEMINI_QUOTA', message: 'Gemini quota or rate limit reached.', upstreamStatus } })
    }
    if (status >= 500 && status <= 599) {
      return res.status(502).json({
        error: {
          code: 'GEMINI_API_ERROR',
          message: `Google Gemini returned HTTP ${status}. The upstream service may be temporarily unavailable.`,
          upstreamStatus,
        },
      })
    }
    return res.status(502).json({ error: { code: 'GEMINI_REQUEST_FAILED', message: 'Gemini request failed. Check the server configuration.', upstreamStatus } })
  } finally {
    clearTimeout(timeout)
  }
})

app.post('/api/analyze', upload.array('screenshots', maxFiles), async (req, res, next) => {
  try {
    if (!req.files?.length) throw new UploadError('Choose at least one screenshot to analyze.')
    if (req.files.some((file) => !isValidImageSignature(file))) {
      throw new UploadError('One or more files do not contain a valid JPEG, PNG, or WebP image.', 415, 'INVALID_IMAGE')
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: { code: 'AI_NOT_CONFIGURED', message: 'Screenshot analysis is not configured on the server yet.' } })
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const parts = [{ text: analysisPrompt }]
    req.files.forEach((file, index) => {
      parts.push({ text: `Screenshot ${index + 1}` })
      parts.push({ inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } })
    })
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json', responseJsonSchema },
    })
    const text = result.text
    if (!text) throw new Error('Gemini returned an empty response.')
    const analysis = JSON.parse(text)
    if (!analysis || !Array.isArray(analysis.screenshots)) throw new Error('Gemini returned an unexpected response format.')

    res.json({ results: req.files.map((file, index) => {
      const screenshotIndex = index + 1
      const record = analysis.screenshots.find((item) => item.screenshotIndex === screenshotIndex) ?? analysis.screenshots[index] ?? {}
      return {
      screenshotIndex,
      filename: file.originalname,
      date: typeof record.date === 'string' ? record.date : null,
      totalScreenTimeMinutes: Number.isInteger(record.totalScreenTimeMinutes) ? record.totalScreenTimeMinutes : null,
      apps: Array.isArray(record.apps) ? record.apps.map((usage) => ({
        appName: typeof usage.appName === 'string' ? usage.appName : null,
        durationMinutes: Number.isInteger(usage.durationMinutes) ? usage.durationMinutes : null,
        displayedDuration: typeof usage.displayedDuration === 'string' ? usage.displayedDuration : null,
        confidence: ['high', 'medium', 'low'].includes(usage.confidence) ? usage.confidence : 'low',
        uncertain: usage.uncertain === true || usage.appName == null || usage.durationMinutes == null,
      })) : [],
    } }) })
  } catch (error) {
    next(error)
  }
})

app.use((error, _req, res, next) => {
  void next
  if (error instanceof multer.MulterError) {
    const isLimit = ['LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT'].includes(error.code)
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Each image must be 8 MB or smaller.'
      : error.code === 'LIMIT_FILE_COUNT'
        ? `Choose no more than ${maxFiles} images at a time.`
        : 'The uploaded files could not be processed.'
    return res.status(isLimit ? 413 : 400).json({ error: { code: error.code, message } })
  }
  if (error instanceof UploadError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message } })
  }
  const message = String(error?.message || '')
  const status = Number(error?.status) || Number(error?.httpStatus) || 0
  if (status === 429 || /quota|resource[_ ]exhausted|rate limit|too many requests|\b429\b/i.test(message)) {
    return res.status(429).json({ error: { code: 'GEMINI_QUOTA', message: 'The analysis service is busy or its quota has been reached. Please try again later.' } })
  }
  if (status >= 400 && status < 500) {
    return res.status(502).json({ error: { code: 'GEMINI_REQUEST_FAILED', message: 'The analysis service could not process these screenshots.' } })
  }
  console.error('Screenshot analysis failed:', error)
  return res.status(502).json({ error: { code: 'ANALYSIS_FAILED', message: 'Screenshot analysis failed. Please try again later.' } })
})

app.listen(port, () => console.log(`ScrollLess API listening on http://localhost:${port}`))
