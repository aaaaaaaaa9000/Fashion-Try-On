import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { installLogin } from './login';

// ---- Config (all from env) ----
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image';
const APP_USERNAME = process.env.APP_USERNAME || 'user';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE) || 10;
const MAX_TEXT_CHARS = Number(process.env.MAX_TEXT_CHARS) || 300;
const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB) || 8;
const MAX_IMAGE_BASE64 = Math.ceil((MAX_IMAGE_MB * 1024 * 1024 * 4) / 3);
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
];

// ---- Prompts (kept on the server so the browser can only send short options) ----
const PROMPTS = {
  model:
    "You are an expert fashion photographer AI. Transform the person in this image into a full-body fashion model photo suitable for an e-commerce website. The background must be a clean, neutral studio backdrop (light gray, #f0f0f0). The person should have a neutral, professional model expression. Preserve the person's identity, unique features, and body type, but place them in a standard, relaxed standing model pose. Head to feet must be fully visible. The final image must be photorealistic. Return ONLY the final image.",
  tryOnPerson: `You are an expert virtual try-on AI. You will be given a 'model image' (first image) and a 'garment image' (second image). Create a new photorealistic image where the person from the model image is wearing the clothing from the garment image.

Rules:
1. Replace the clothing item the garment covers completely. No part of the original item (collars, sleeves, patterns) may remain visible.
2. Keep the person's face, hair, skin tone, body shape and pose unchanged.
3. Keep the background unchanged.
4. Reproduce the garment exactly: same color, fabric, print, lace and cut. Fit it naturally with realistic folds, shadows and lighting.
5. Return ONLY the final image, no text.`,
  tryOnMannequin: `You are an expert virtual try-on AI for a fashion and lingerie store catalog. You will be given an image of a display mannequin (first image) and a 'garment image' (second image). Dress the mannequin in the garment from the garment image.

Rules:
1. Reproduce the garment exactly: same color, fabric, print, lace and cut.
2. If the mannequin already wears clothing that the new garment covers, replace it completely.
3. Keep the mannequin, its pose and the background unchanged.
4. Fit the garment realistically with natural folds, shadows and lighting.
5. Return ONLY the final image, no text.`,
  pose: (pose: string) =>
    `You are an expert fashion photographer AI. Take this image and regenerate it from a different perspective. The subject, every piece of clothing and the background style must remain identical. The new perspective should be: "${pose}". Return ONLY the final image.`,
  color: (color: string) =>
    `You are an expert fashion photo editor. Recolor the main garment worn in this image to '${color}'. If the garment is a matching set (for example a bra and briefs, or a top and trousers), recolor every piece of the set. Keep its fabric, lace, print texture and cut. You MUST NOT change anything else: the subject, pose, framing, any other clothing items and the background must remain identical. Return ONLY the edited image.`,
  background: (bg: string) =>
    `You are an expert photo editor AI. Replace the background of the provided image with a new background described as: "${bg}".
Rules:
1. The subject, clothing, pose and lighting on the subject must remain completely unchanged.
2. The new background must be photorealistic and integrate seamlessly.
3. Return ONLY the final image, no text.`,
};

// ---- Gemini client (created once, lazily) ----
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw Object.assign(new Error('GEMINI_API_KEY is not set'), { status: 'NO_KEY' });
  }
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return aiClient;
}

// ---- Helpers ----
type ImageInput = { base64: string; mimeType: string };

/** Returns an Arabic error message if the image is invalid, otherwise null. */
function validateImage(img: unknown, label: string): string | null {
  const i = img as Partial<ImageInput> | undefined;
  if (!i || typeof i.base64 !== 'string' || !i.base64) return `${label} ناقصة.`;
  if (typeof i.mimeType !== 'string' || !ALLOWED_MIME.has(i.mimeType)) {
    return `نوع ${label} غير مدعوم. استخدم صورة عادية (جي بي جي أو بي إن جي).`;
  }
  if (i.base64.length > MAX_IMAGE_BASE64) return `${label} كبيرة جدًا. الحد الأقصى ${MAX_IMAGE_MB} ميجا.`;
  return null;
}

/** Returns an Arabic error message if the text option is invalid, otherwise null. */
function validateText(value: unknown, label: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return `${label} فاضي.`;
  if (value.length > MAX_TEXT_CHARS) return `${label} طويل جدًا. الحد الأقصى ${MAX_TEXT_CHARS} حرف.`;
  return null;
}

const part = (img: ImageInput) => ({ inlineData: { data: img.base64, mimeType: img.mimeType } });

/** Maps a Gemini SDK error to an HTTP status and an Arabic message; logs details server-side. */
function sendGeminiError(res: Response, error: any, context: string) {
  console.error(`[${context}]`, error?.status, error?.message);
  const msg = String(error?.message || '');
  if (error?.status === 'NO_KEY') {
    return res.status(500).json({ error: 'مفتاح جيميناي مش متضبط على السيرفر.' });
  }
  if (/spend(ing)? cap/i.test(msg)) {
    return res.status(429).json({ error: 'مشروع جيميناي وصل لحد الصرف الشهري. ارفع الحد من إعدادات جوجل أو استنى شوية.' });
  }
  if (error?.status === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return res.status(429).json({ error: 'تم تجاوز حد الاستخدام للمفتاح. جرّب تاني بعد شوية.' });
  }
  if (error?.status === 403 || /PERMISSION_DENIED|API_KEY_INVALID|API key/i.test(msg)) {
    return res.status(502).json({ error: 'مفتاح جيميناي مرفوض. راجع المفتاح في إعدادات السيرفر.' });
  }
  if (/Unsupported MIME type/i.test(msg)) {
    return res.status(400).json({ error: 'نوع الصورة غير مدعوم. استخدم جي بي جي أو بي إن جي.' });
  }
  return res.status(500).json({ error: 'حصلت مشكلة أثناء المعالجة. جرّب تاني.' });
}

/** Runs one image generation and sends the image (or an Arabic error) as JSON. */
async function generate(res: Response, context: string, parts: any[], aspectRatio?: string) {
  try {
    const response = await getAI().models.generateContent({
      model: IMAGE_MODEL,
      contents: { parts },
      config: {
        safetySettings: SAFETY_SETTINGS as any,
        ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
      },
    });

    for (const p of response.candidates?.[0]?.content?.parts || []) {
      if (p.inlineData?.data) {
        return res.json({ base64: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/jpeg' });
      }
    }

    const reason = response.candidates?.[0]?.finishReason || response.promptFeedback?.blockReason;
    console.warn(`[${context}] no image returned, reason:`, reason);
    if (reason && reason !== 'STOP') {
      return res.status(422).json({ error: 'جيميناي رفض يعمل الصورة دي.', code: 'refused' });
    }
    return res.status(502).json({ error: 'الموديل ماطلّعش صورة. جرّب تاني.' });
  } catch (error) {
    return sendGeminiError(res, error, context);
  }
}

// ---- Rate limit (per IP, fixed 1-minute window, in memory) ----
const hits = new Map<string, { count: number; reset: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (h.reset <= now) hits.delete(ip);
}, 60_000).unref();

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || h.reset <= now) {
    h = { count: 0, reset: now + 60_000 };
    hits.set(ip, h);
  }
  h.count++;
  if (h.count > RATE_LIMIT_PER_MINUTE) {
    res.setHeader('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
    return res.status(429).json({ error: 'طلبات كتير في وقت قصير. استنى دقيقة وجرّب تاني.' });
  }
  next();
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Health check (before auth so Docker/Traefik can reach it)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // In-page login form + session cookie (only when APP_PASSWORD is set)
  installLogin(app, { appName: 'غرفة القياس', username: APP_USERNAME, password: APP_PASSWORD, accent: '#9C3548' });

  // Two images at MAX_IMAGE_MB each, with some headroom.
  app.use('/api', express.json({ limit: `${MAX_IMAGE_MB * 3 + 1}mb` }));

  // 1) Person photo → clean full-body model photo
  app.post('/api/model', rateLimit, async (req, res) => {
    const { image } = req.body || {};
    const err = validateImage(image, 'صورتك');
    if (err) return res.status(400).json({ error: err });
    return generate(res, 'model', [part(image), { text: PROMPTS.model }], '3:4');
  });

  // 2) Put a garment on the current image (person or mannequin)
  app.post('/api/tryon', rateLimit, async (req, res) => {
    const { image, garment, subject } = req.body || {};
    const err = validateImage(image, 'صورة الموديل') || validateImage(garment, 'صورة القطعة');
    if (err) return res.status(400).json({ error: err });
    const prompt = subject === 'mannequin' ? PROMPTS.tryOnMannequin : PROMPTS.tryOnPerson;
    return generate(res, `tryon:${subject === 'mannequin' ? 'mannequin' : 'person'}`, [part(image), part(garment), { text: prompt }]);
  });

  // 3) Edits on the current image: pose / color / background
  app.post('/api/edit', rateLimit, async (req, res) => {
    const { image, kind, value } = req.body || {};
    const builder = kind === 'pose' ? PROMPTS.pose : kind === 'color' ? PROMPTS.color : kind === 'background' ? PROMPTS.background : null;
    if (!builder) return res.status(400).json({ error: 'نوع التعديل غير معروف.' });
    const err = validateImage(image, 'الصورة') || validateText(value, 'الاختيار');
    if (err) return res.status(400).json({ error: err });
    return generate(res, `edit:${kind}`, [part(image), { text: builder(value.trim()) }]);
  });

  // Unknown API routes → JSON 404 (instead of the SPA page)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (IS_PROD) {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(distPath, { index: false, maxAge: '1d' }));
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Server on :${PORT} | image model: ${IMAGE_MODEL} | auth: ${APP_PASSWORD ? 'on' : 'off'} | ` +
        `rate limit: ${RATE_LIMIT_PER_MINUTE}/min | key: ${process.env.GEMINI_API_KEY ? 'set' : 'MISSING'}`,
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
