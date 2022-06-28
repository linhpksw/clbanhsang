let requests = [];

export const userRequest = (req, res) => {
    const request = req.body;
    requests.push(request);
};
