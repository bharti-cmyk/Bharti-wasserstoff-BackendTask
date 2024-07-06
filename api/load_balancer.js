const express = require('express');
const axios = require('axios');
const winston = require('winston');

const app = express();
require('dotenv').config();

// Create a logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'load_balancer.log' })
    ]
  });
const servers = [
    { url: process.env.API_SERVER_1_URL || 'http://localhost:8001', weight: 1, currentLoad: 0 },
    { url: process.env.API_SERVER_2_URL || 'http://localhost:8002', weight: 3, currentLoad: 0 }
  
];

let totalWeight = servers.reduce((acc, server) => acc + server.weight, 0);

// Function to select server based on weight
const selectServer = () => {
    let random = Math.random() * totalWeight;
    for (let server of servers) {
      if (random < server.weight) {
        return server;
      }
      random -= server.weight;
    }
  };

// Queues for different strategies
const fifoQueue = [];
const priorityQueue = [];
const roundRobinQueue = [];

// Function to process the next request in the queue
const processQueue = async (queue, queueType) => {
    if (queue.length === 0) return;
  
    const { req, res, startTime } = queue.shift();
    let targetServer;
  
    // Custom routing based on request type
    const requestType = req.header('X-Request-Type');
    if (requestType === 'fast') {
      targetServer = `${selectServer().url}/fast`;
    } else if (requestType === 'slow') {
      targetServer = `${selectServer().url}/slow`;
    } else {
      // Default round-robin routing
      targetServer = `${selectServer().url}/fast`;
    }
  
    const selectedServer = servers.find(server => server.url === targetServer.substring(0, targetServer.lastIndexOf('/')));
    selectedServer.currentLoad += 1;
  
    // Log the selected endpoint
    logger.info({
      message: 'Endpoint selected',
      endpoint: targetServer,
      requestType,
      queueType,
      serverLoad: servers.map(server => ({ url: server.url, currentLoad: server.currentLoad }))
    });
  
    try {
      const response = await axios.get(targetServer);
      const responseTime = Date.now() - startTime;
  
      selectedServer.currentLoad -= 1;
  
      // Log request and response details
      logger.info({
        message: 'Request handled',
        endpoint: targetServer,
        requestType,
        status: response.status,
        responseTime,
        queueType,
        serverLoad: servers.map(server => ({ url: server.url, currentLoad: server.currentLoad }))
      });
  
      res.status(response.status).json(response.data);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      selectedServer.currentLoad -= 1;
  
      // Log error details
      logger.error({
        message: 'Request failed',
        endpoint: targetServer,
        requestType,
        error: error.message,
        responseTime,
        queueType,
        serverLoad: servers.map(server => ({ url: server.url, currentLoad: server.currentLoad }))
      });
  
      res.status(500).json({ error: error.message });
    }
  
    // Process the next request in the queue
    processQueue(queue, queueType);
  };

// Function to add a request to the priority queue based on its priority
const addToPriorityQueue = (req, res, startTime) => {
    const priority = parseInt(req.header('X-Priority')) || 0;
    const request = { req, res, startTime, priority };
    priorityQueue.push(request);
    priorityQueue.sort((a, b) => b.priority - a.priority);
  };

//api created for milestone1 as it can fetch values from req.header and accordingly process the functionality
// app.get('/api', async (req, res) => {
//     let targetServer;
//     const startTime = Date.now();
//     // const customHeader = req.header('X-Custom-Header');
//     // if(customHeader === 'server1') {
//     //     targetServer = servers[0];
//     // } else if(customHeader === 'server2') {
//     //     targetServer = servers[1];
//     // }
//     // else{
//     //     targetServer = servers[currentServerIndex];
//     //     currentServerIndex = (currentServerIndex + 1) % servers.length;
//     // }
//     const apiType = req.header('X-API-Type');
//     const requestType = req.header('X-Request-Type');
//     if(apiType === 'REST') {
//         // const randomIndex = Math.floor(Math.random() * servers.length);
//         // targetServer = servers[randomIndex];
//         if(requestType === 'fast') {
//             const randomIndex = Math.floor(Math.random() * servers.length);
//             targetServer = `${servers[randomIndex]}/fast`;

//         } else if(requestType === 'slow') {
//             const randomIndex = Math.floor(Math.random() * servers.length);
//             targetServer = `${servers[randomIndex]}/slow`;

//         }
//         else {
//             const randomIndex = Math.floor(Math.random() * servers.length);
//             targetServer = `${servers[randomIndex]}/fast`;
//         }
//     } else {
//         //Default to round-robin routing if no API type specified
//         targetServer = servers[currentServerIndex];
//         currentServerIndex = (currentServerIndex + 1) % servers.length;
//     }

//     const customCriteria = req.header('X-Custom-Criteria');
//     if(customCriteria === 'special') {
//         targetServer = `${servers[0]}/api`;
//     }

//     // Log the selected endpoint
//     logger.info({
//         message: 'Endpoint selected',
//         endpoint: targetServer,
//         requestType
//       });

//     try {
//         const response = await axios.get(targetServer);
//         const responseTime = Date.now() - startTime;
        
//         // Log request and response details
//         logger.info({
//             message: 'Request handled',
//             endpoint: targetServer,
//             requestType,
//             status: response.status,
//             responseTime
//         });
//         res.status(response.status).json(response.data);
//     } catch (error) {
//         const responseTime = Date.now() - startTime;
//         // Log error details
//         logger.error({
//             message: 'Request failed',
//             endpoint: targetServer,
//             requestType,
//             error: error.message,
//             responseTime
//         });
//         res.status(500).json({ error: error.message });
//     }

//     });

app.get('/api', (req, res) => {
    const startTime = Date.now();
    const queueStrategy = req.header('X-Queue-Strategy');
  
    if (queueStrategy === 'FIFO') {
      fifoQueue.push({ req, res, startTime });
      logger.info({
        message: 'Request added to FIFO queue',
        queueLength: fifoQueue.length
      });
      if (fifoQueue.length === 1) processQueue(fifoQueue, 'FIFO');
    } else if (queueStrategy === 'PRIORITY') {
      addToPriorityQueue(req, res, startTime);
      logger.info({
        message: 'Request added to Priority queue',
        queueLength: priorityQueue.length,
        priority: req.header('X-Priority')
      });
      if (priorityQueue.length === 1) processQueue(priorityQueue, 'PRIORITY');
    } else if (queueStrategy === 'ROUND_ROBIN') {
      roundRobinQueue.push({ req, res, startTime });
      logger.info({
        message: 'Request added to Round Robin queue',
        queueLength: roundRobinQueue.length
      });
      if (roundRobinQueue.length === 1) processQueue(roundRobinQueue, 'ROUND_ROBIN');
    } else {
      res.status(400).json({ error: 'Invalid queue strategy' });
    }
  });
  const PORT = process.env.LOAD_BALANCER_PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Load balancer running on port ${PORT}`);
  });
  