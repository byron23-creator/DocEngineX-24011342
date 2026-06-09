const { Router } = require('express');
const ctrl = require('../controllers/documentController');

const router = Router();

// POST /api/documents — Submit JSON payload and enqueue document generation
router.post('/', ctrl.generate);

// GET /api/documents — List all documents; ?status=failed for audit filter
router.get('/', ctrl.list);

// GET /api/documents/:id — Fetch a single document by UUID
router.get('/:id', ctrl.getOne);

// PATCH /api/documents/:id/status — Internal endpoint used by the worker
router.patch('/:id/status', ctrl.updateStatus);

module.exports = router;
