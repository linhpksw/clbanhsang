import express from 'express';
import { cassoRequest, failExtract, unsendTransaction, syncTuition } from '../controllers/casso.js';

const router = express.Router();
router.post('/', cassoRequest);
router.post('/failExtract', failExtract);
router.post('/unsendTransaction', unsendTransaction);
router.post('/syncTuition', syncTuition);

export default router;
