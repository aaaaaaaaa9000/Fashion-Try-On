import type { Img, SubjectKind } from './types';

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function post(path: string, body: unknown): Promise<Img> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('مفيش اتصال بالسيرفر. اتأكد من النت وجرّب تاني.');
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new ApiError('انتهت الجلسة. حدّث الصفحة وسجّل الدخول من جديد.');
  if (res.status === 413) throw new ApiError('الصور كبيرة جدًا. جرّب صورة أصغر.');
  if (!res.ok) throw new ApiError(data?.error || `حصلت مشكلة (${res.status}). جرّب تاني.`, data?.code);
  if (!data?.base64) throw new ApiError('السيرفر مارجّعش صورة.');
  return { base64: data.base64, mimeType: data.mimeType || 'image/jpeg' };
}

export const makeModel = (image: Img) => post('/api/model', { image });

export const tryOn = (image: Img, garment: Img, subject: SubjectKind) => post('/api/tryon', { image, garment, subject });

export const editImage = (image: Img, kind: 'pose' | 'color' | 'background', value: string) =>
  post('/api/edit', { image, kind, value });
