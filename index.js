import express from 'express';
import 'dotenv/config';
import bodyParser from 'body-parser';
/******************************************* */
import usersRoutes from './routes/user.js';
import appsheetRoutes from './routes/appsheet.js';
import gsRoutes from './routes/gs.js';
import teleRoutes from './routes/tele.js';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());
app.use('/users', usersRoutes);
app.use('/appsheet', appsheetRoutes);
app.use('/gs', gsRoutes);
app.use('/tele', teleRoutes);

const { TELE_TOKEN, SERVER_URL } = process.env;
const TELE_API = `https://api.telegram.org/bot${TELE_TOKEN}`;
const URI = `/tele/${TELE_TOKEN}`;
const URL = SERVER_URL + URI;

const init = async () => {
    const res = await axios.get(`${TELE_API}/setWebhook?url=${URL}`);
    console.log(res.data);
};

app.listen(PORT, () => console.log(`Server is running on PORT: http://localhost:${PORT}`));

app.get('/', (req, res) => res.send('Hello.'));
