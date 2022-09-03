import express from 'express';
import { cassoRequest, failExtract } from '../controllers/casso.js';

const router = express.Router();
router.post('/', cassoRequest);
router.post('/failExtract', failExtract);

export default router;
