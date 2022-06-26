import express from 'express';
import {
    createUser,
    getUsers,
    getUser,
    deleteUser,
} from '../controllers/user.js';

const router = express.Router();

router.get('/', getUsers);

router.post('/', createUser);

router.get('/:id', getUser);

router.delete('/:id', deleteUser);

export default router;
