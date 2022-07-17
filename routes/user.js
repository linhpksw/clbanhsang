import express from 'express';
import { userRequest, tokenRequest } from '../controllers/user.js';

const router = express.Router();
router.post('/token', tokenRequest);
router.post('/', userRequest);

export default router;
