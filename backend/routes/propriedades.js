const express = require('express');
const router = express.Router();
const Propriedade = require('../models/propriedade');
const neo4jDriver = require("../config/neo4j");

// Middleware para buscar propriedade por ID
async function getPropriedade(req, res, next) {
    let propriedade;
    try {
        propriedade = await Propriedade.findById(req.params.id);
        if (propriedade == null) {
            return res.status(404).json({ message: 'Propriedade não encontrada' });
        }
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
    res.propriedade = propriedade;
    next();
}

// Rota: Obter todas as propriedades (READ ALL)
router.get('/', async (req, res) => {
    try {
        const propriedades = await Propriedade.find();
        res.json(propriedades);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Rota: Obter uma propriedade específica (READ ONE)
router.get('/:id', getPropriedade, (req, res) => {
    res.json(res.propriedade);
});

// Rota: Criar uma nova propriedade (CREATE)
router.post("/", async (req, res) => {
    const { nome, descricao, areaHectares, culturaPrincipal, localizacao, tags } = req.body;

    // Validação básica para GeoJSON Point
    if (!localizacao || localizacao.type !== "Point" || !Array.isArray(localizacao.coordinates) || localizacao.coordinates.length !== 2) {
        return res.status(400).json({ message: "Formato de localização inválido. Esperado { type: \"Point\", coordinates: [longitude, latitude] }" });
    }

    const propriedade = new Propriedade({
        nome,
        descricao,
        areaHectares,
        culturaPrincipal,
        localizacao,
        tags
    });

    let session; // Declarada a sessão fora do try para que possa ser acessada no finally
    try {
        const novaPropriedade = await propriedade.save();

        // Operação no Neo4J
        session = neo4jDriver.session();
        const query = `
            CREATE (p:Propriedade {mongo_id: $mongoId, nome: $nome})
            ${culturaPrincipal ? `
                MERGE (c:Cultura {nome: $culturaPrincipal})
                CREATE (p)-[:PRODUZ]->(c)
            ` : ``}
            RETURN p
        `;
        await session.run(query, {
            mongoId: novaPropriedade._id.toString(), // Armazena o ID do MongoDB no Neo4J
            nome: novaPropriedade.nome,
            culturaPrincipal: novaPropriedade.culturaPrincipal
        });
        console.log(`Nó Propriedade ${novaPropriedade.nome} e relacionamentos criados no Neo4J.`);

        res.status(201).json(novaPropriedade);
    } catch (err) {
        console.error("Erro ao salvar propriedade no MongoDB ou Neo4J:", err);
        res.status(400).json({ message: err.message });
    } finally {
        if (session) {
            session.close();
        }
    }
});

// Rota: Deletar uma propriedade (DELETE)
router.delete('/:id', getPropriedade, async (req, res) => {
    try {
        await Propriedade.deleteOne({ _id: res.propriedade._id });
        res.json({ message: 'Propriedade excluída com sucesso' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Rota: Busca textual completa (Full-text Search)
router.get('/search/:text', async (req, res) => {
    try {
        const searchText = req.params.text;
        // O $text operador usa o índice de texto definidos no schema
        const propriedades = await Propriedade.find({
            $text: { $search: searchText }
        }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } }); // Ordena por relevância

        res.json(propriedades);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
