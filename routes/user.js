import express from 'express';
import { userRequest, tokenRequest, updateRequest } from '../controllers/user.js';

const router = express.Router();
router.post('/token', tokenRequest);
router.post('/', userRequest);
router.post('/gs', updateRequest);

export default router;
