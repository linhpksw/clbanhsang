import express from 'express';
import { userRequest, tokenRequest, updateRequest, invoiceRequest } from '../controllers/user.js';

const router = express.Router();
router.post('/token', tokenRequest);
router.post('/', userRequest);
router.post('/gs', updateRequest);
router.post('/invoice', invoiceRequest);

export default router;
