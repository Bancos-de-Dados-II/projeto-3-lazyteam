const neo4j = require("neo4j-driver");

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;

if (!uri || !user || !password) {
    console.error("Variáveis de ambiente do Neo4J não configuradas. Verifique NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD.");
    process.exit(1); // Encerra a aplicação se as credenciais não estiverem configuradas
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

driver.verifyConnectivity()
    .then(() => {
        console.log("Conectado ao Neo4J!");
    })
    .catch((error) => {
        console.error("Erro de conexão com Neo4J:", error);
        process.exit(1); // Encerra a aplicação se a conexão falhar
    });

module.exports = driver;