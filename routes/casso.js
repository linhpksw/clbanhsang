import express from 'express';
import { cassoRequest } from '../controllers/casso.js';

const router = express.Router();
router.post('/', cassoRequest);

export default router;
