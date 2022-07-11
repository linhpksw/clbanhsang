import express from 'express';
import { dataRequest } from '../controllers/data.js';

const router = express.Router();
router.post('/', dataRequest);

export default router;
