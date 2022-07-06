import express from 'express';
import { tokenRequest } from '../controllers/token.js';

const router = express.Router();
router.post('/', tokenRequest);

export default router;
