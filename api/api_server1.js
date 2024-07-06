const express = require('express');
const app = express();
require('dotenv').config();

app.get('/api', (req, res) => {
    res.json({ message: 'Response from API Server 1' });
});

app.get('/fast', (req, res) => {
    res.json({ message: 'Fast Response from API Server 1' });
});

app.get('/slow', (req, res) => {
    setTimeout(() => {
        res.json({ message: 'Slow Response from API Server 1' });
    }, 5000);
});
const PORT = process.env.API_SERVER_1_PORT || 8001;
app.listen(PORT, () => {
  console.log(`API Server 1 running on port ${PORT}`);
});
