import express from 'express';
import { userRequest } from '../controllers/user.js';

const router = express.Router();
router.post('/', userRequest);

export default router;
