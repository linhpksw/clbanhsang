import express from 'express';
import { botRequest } from '../controllers/tele.js';

const router = express.Router();
router.post('/', botRequest);

export default router;
