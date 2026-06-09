const documentService = require('../services/documentService');

const VALID_TEMPLATES = ['invoice', 'report', 'certificate'];
const VALID_STATUSES  = ['queued', 'processing', 'completed', 'failed'];

// Wraps async route handlers so unhandled promise rejections are forwarded
// to Express's error handler instead of crashing the process.
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const generate = asyncHandler(async (req, res) => {
  const { template_type, payload } = req.body;

  if (!template_type || !VALID_TEMPLATES.includes(template_type)) {
    return res.status(400).json({
      error: `template_type must be one of: ${VALID_TEMPLATES.join(', ')}`,
    });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'payload must be a JSON object' });
  }

  const doc = await documentService.createDocument(template_type, payload);

  // Notify all connected Socket.io clients that a new job was queued.
  req.io.emit('doc:status', { id: doc.id, status: 'queued', template_type: doc.template_type });

  return res.status(202).json(doc);
});

const list = asyncHandler(async (req, res) => {
  const { status } = req.query;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status filter must be one of: ${VALID_STATUSES.join(', ')}`,
    });
  }

  const docs = await documentService.listDocuments(status || null);
  return res.json(docs);
});

const getOne = asyncHandler(async (req, res) => {
  const doc = await documentService.getDocumentById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  return res.json(doc);
});

// Internal endpoint used by the worker to push status updates.
// Emits a Socket.io event so the dashboard updates in real time.
const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, file_url, error_reason } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  const doc = await documentService.updateDocument(id, { status, file_url, error_reason });
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  req.io.emit('doc:status', {
    id:           doc.id,
    status:       doc.status,
    file_url:     doc.file_url,
    error_reason: doc.error_reason,
    template_type: doc.template_type,
  });

  return res.json(doc);
});

module.exports = { generate, list, getOne, updateStatus };
