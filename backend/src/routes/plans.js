const express = require('express');
const { publicCatalog } = require('../config/plans');
const router = express.Router();
router.get('/', (req, res) => res.json(publicCatalog()));
module.exports = router;
