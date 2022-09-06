import express from 'express';
import { cassoRequest, failExtract, unsendTransaction } from '../controllers/casso.js';

const router = express.Router();
router.post('/', cassoRequest);
router.post('/failExtract', failExtract);
router.post('/unsendTransaction', unsendTransaction);

export default router;
