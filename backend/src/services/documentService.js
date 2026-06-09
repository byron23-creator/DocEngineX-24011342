const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const documentQueue = require('../config/queue');

// Enqueues a new document job and persists the initial record to the DB.
// Returns the created document record.
async function createDocument(templateType, payload) {
  const id = uuidv4();

  const { rows } = await pool.query(
    `INSERT INTO public_documents (id, status, template_type)
     VALUES ($1, 'queued', $2)
     RETURNING *`,
    [id, templateType]
  );

  const doc = rows[0];

  await documentQueue.add(
    'generate',
    { docId: id, templateType, payload },
    { jobId: id }
  );

  return doc;
}

// Returns all documents, optionally filtered by status.
async function listDocuments(status) {
  const conditions = [];
  const values = [];

  if (status) {
    conditions.push(`status = $${values.length + 1}`);
    values.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT id, status, template_type, file_url, error_reason, created_at
     FROM public_documents
     ${where}
     ORDER BY created_at DESC`,
    values
  );

  return rows;
}

// Returns a single document by id.
async function getDocumentById(id) {
  const { rows } = await pool.query(
    `SELECT id, status, template_type, file_url, error_reason, created_at
     FROM public_documents
     WHERE id = $1`,
    [id]
  );

  return rows[0] || null;
}

// Updates a document's status, file_url, or error_reason.
// Used internally by the worker via HTTP or direct DB access.
async function updateDocument(id, fields) {
  const setClauses = [];
  const values = [];

  if (fields.status !== undefined) {
    setClauses.push(`status = $${values.length + 1}`);
    values.push(fields.status);
  }
  if (fields.file_url !== undefined) {
    setClauses.push(`file_url = $${values.length + 1}`);
    values.push(fields.file_url);
  }
  if (fields.error_reason !== undefined) {
    setClauses.push(`error_reason = $${values.length + 1}`);
    values.push(fields.error_reason);
  }

  if (setClauses.length === 0) return null;

  values.push(id);

  const { rows } = await pool.query(
    `UPDATE public_documents
     SET ${setClauses.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );

  return rows[0] || null;
}

module.exports = { createDocument, listDocuments, getDocumentById, updateDocument };
