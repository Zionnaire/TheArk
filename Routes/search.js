const express = require("express");
const searchRouter = express.Router();
const { search } = require("../Controllers/searchController");

searchRouter.get("/", search);

module.exports = searchRouter;
