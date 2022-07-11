import express from 'express';
import 'dotenv/config';
import bodyParser from 'body-parser';
/******************************************* */
import usersRoutes from './routes/user.js';
import dataRoutes from './routes/data.js';
import appsheetRoutes from './routes/appsheet.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());
app.use('/users', usersRoutes);
app.use('/import', dataRoutes);
app.use('/appsheet', appsheetRoutes);

app.listen(PORT, () => console.log(`Server is running on PORT: http://localhost:${PORT}`));

app.get('/', (req, res) => res.send('Hello Linh.'));
