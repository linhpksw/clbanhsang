import express from 'express';
import 'dotenv/config';
import bodyParser from 'body-parser';
/******************************************* */
import usersRoutes from './routes/user.js';
import dbRoutes from './routes/db.js';
import tokenRoutes from './routes/token.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());
app.use('/users', usersRoutes);
app.use('/db', dbRoutes);
app.use('/token', tokenRoutes);

app.listen(PORT, () =>
    console.log(`Server is running on PORT: http://localhost:${PORT}`)
);

app.get('/', (req, res) => res.send('Hello Linh.'));
