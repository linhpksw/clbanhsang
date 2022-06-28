let requests = [];

export const userRequest = (req, res) => {
    const request = req.body;
    requests.push(request);
    res.send(request);
};

export const getUserRequest = (req, res) => {
    res.send(requests);
};
