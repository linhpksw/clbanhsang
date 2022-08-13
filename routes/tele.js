import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { TELE_TOKEN } = process.env;

import { botRequest } from '../controllers/tele.js';

const router = express.Router();
const URI = `/tele/${TELE_TOKEN}`;
router.post(URI, botRequest);

export default router;
