import { v4 as uuidv4 } from 'uuid';
let requests = [];

export const userRequest = (req, res) => {
    const request = req.body;
    requests.push(request);
    // users.push({ ...user, id: uuidv4() });
    // res.send(`User with the name ${user.firstName} added to the database!`);
};

// export const getUsers = (req, res) => {
//     res.send(users);
// };

// export const getUser = (req, res) => {
//     const { id } = req.params;
//     const foundUser = users.find((user) => user.id === id);
//     res.send(foundUser);
// };

// export const deleteUser = (req, res) => {
//     const { id } = req.params;
//     users = users.filter((user) => user.id !== id);
//     res.send(`User with the id ${id} deleted from the database.`);
// };
