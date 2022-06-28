import { v4 as uuidv4 } from 'uuid';
let requests = [];

export const userRequest = (req, res) => {
    const request = req.body;
    requests.push(request);
};
