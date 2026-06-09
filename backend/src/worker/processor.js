require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('bullmq');
const Handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const redisConnection = require('../config/redis');
const s3Client = require('../config/s3');
const pool = require('../config/db');

const TEMPLATES_DIR = path.join(__dirname, '../templates');
const S3_BUCKET = process.env.S3_BUCKET;
const API_URL = process.env.API_URL || 'http://localhost:3000';

// Register a helper used in the invoice template.
Handlebars.registerHelper('add', (a, b) => a + b);

// Compiles a .hbs template file and renders it with the given data.
function renderTemplate(templateType, data) {
  const filePath = path.join(TEMPLATES_DIR, `${templateType}.hbs`);
  const source = fs.readFileSync(filePath, 'utf8');
  const template = Handlebars.compile(source);
  return template(data);
}

// Uses Puppeteer to convert an HTML string to a PDF Buffer.
async function htmlToPdf(html) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
  });

  await browser.close();
  return pdf;
}

// Uploads a Buffer to S3 and returns the public object URL.
async function uploadToS3(pdfBuffer, docId, templateType) {
  const key = `documents/${templateType}/${docId}.pdf`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      // ACLs disabled by default in modern S3 buckets (Object Ownership = Bucket owner enforced).
      // Public access is granted via Bucket Policy instead.
    })
  );

  const region = process.env.AWS_REGION;
  return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`;
}

// Notifies the API server so it can persist the new status and emit a socket event.
async function notifyApi(docId, fields) {
  const res = await fetch(`${API_URL}/api/documents/${docId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API notification failed (${res.status}): ${text}`);
  }
}

// Main BullMQ worker — processes one job at a time from the document-generation queue.
const worker = new Worker(
  'document-generation',
  async (job) => {
    const { docId, templateType, payload } = job.data;

    console.log(`[Worker] Processing job ${job.id} — docId: ${docId}, template: ${templateType}`);

    // 1. Mark as processing
    await notifyApi(docId, { status: 'processing' });

    // 2. Render HTML from Handlebars template
    const html = renderTemplate(templateType, payload);

    // 3. Generate PDF via Puppeteer
    const pdfBuffer = await htmlToPdf(html);

    // 4. Upload PDF to S3
    const fileUrl = await uploadToS3(pdfBuffer, docId, templateType);

    // 5. Mark as completed with the S3 URL
    await notifyApi(docId, { status: 'completed', file_url: fileUrl });

    console.log(`[Worker] Job ${job.id} completed — URL: ${fileUrl}`);
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

worker.on('failed', async (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed after all retries:`, err.message);

  if (job?.data?.docId) {
    try {
      await notifyApi(job.data.docId, {
        status: 'failed',
        error_reason: err.message,
      });
    } catch (notifyErr) {
      // If the API is unreachable, update the DB directly as a fallback.
      await pool.query(
        `UPDATE public_documents SET status = 'failed', error_reason = $1 WHERE id = $2`,
        [err.message, job.data.docId]
      );
    }
  }
});

worker.on('ready', () => console.log('[Worker] Ready — listening on queue: document-generation'));
worker.on('error', (err) => console.error('[Worker] Error:', err.message));

console.log('[Worker] DocEngine-X processor started');
