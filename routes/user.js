import express from 'express';
import { userRequest, getUserRequest } from '../controllers/user.js';

const router = express.Router();
router.post('/', userRequest);
router.get('/', getUserRequest);

export default router;
