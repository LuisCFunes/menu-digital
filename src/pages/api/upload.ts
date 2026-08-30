import type { APIRoute } from 'astro';
import { v2 as cloudinary } from 'cloudinary';

import { isDashboardAuthenticated } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!await isDashboardAuthenticated(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to Cloudinary using a stream
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { 
          folder: 'menudigital',
          transformation: [
            { width: 800, crop: 'limit' },
            { fetch_format: 'auto', quality: 'auto' }
          ]
        },
        (error, result) => {
          if (result) {
            resolve(result);
          } else {
            reject(error);
          }
        }
      );
      uploadStream.end(buffer);
    });

    const url = (result as any).secure_url;

    return new Response(JSON.stringify({ url, filename: file.name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Upload failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
