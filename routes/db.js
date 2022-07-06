import express from 'express';
import { dbRequest } from '../controllers/db.js';

const router = express.Router();
router.post('/', dbRequest);

export default router;
