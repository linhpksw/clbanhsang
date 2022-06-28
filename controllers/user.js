let requests = [];

export const userRequest = (req, res) => {
    const request = req.body;
    requests.push(request);
    res.send('Success');
};

export const getUserRequest = (req, res) => {
    res.send(requests);
};
