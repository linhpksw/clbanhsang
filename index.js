import express from 'express';
import 'dotenv/config';
import bodyParser from 'body-parser';
/******************************************* */
import usersRoutes from './routes/user.js';
import appsheetRoutes from './routes/appsheet.js';
import gsRoutes from './routes/gs.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());
app.use('/users', usersRoutes);
app.use('/appsheet', appsheetRoutes);
app.use('/gs', gsRoutes);

app.listen(PORT, () => console.log(`Server is running on PORT: http://localhost:${PORT}`));

app.get('/', (req, res) => res.send('Hello Linh.'));
