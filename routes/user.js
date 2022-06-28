import express from 'express';
import { userRequest } from '../controllers/user.js';

const router = express.Router();

// router.get('/', getUsers);
router.post('/', userRequest);
// router.get('/:id', getUser);
// router.delete('/:id', deleteUser);

export default router;
