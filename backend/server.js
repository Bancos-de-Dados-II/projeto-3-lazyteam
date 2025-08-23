require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const neo4jDriver = require("./config/neo4j");

const app = express();
const PORT = process.env.PORT || 5000; 

// Middlewares
app.use(cors()); 
app.use(express.json()); 

// Conexão com o MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Conectado ao MongoDB Atlas!"))
    .catch(err => console.error("Erro de conexão com MongoDB Atlas:", err));

// Importar rotas de propriedades
const propriedadesRouter = require('./routes/propriedades');
app.use('/api/propriedades', propriedadesRouter); // Prefixo para todas as rotas de propriedades

process.on("exit", () => {
    neo4jDriver.close();
    console.log("Conexão com Neo4J encerrada.");
});

process.on("SIGINT", async () => {
    await neo4jDriver.close();
    console.log("Conexão com Neo4J encerrada (SIGINT).");
    process.exit();
});

// Rota de teste inicial
app.get("/", (req, res) => {
    res.send("API de Propriedades está funcionando!");
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
