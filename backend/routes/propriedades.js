const express = require("express");
const router = express.Router();
const Propriedade = require("../models/propriedade");
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
router.post('/', async (req, res) => {
    const { nome, descricao, areaHectares, culturaPrincipal, localizacao, tags } = req.body;

    if (!localizacao || localizacao.type !== 'Point' || !Array.isArray(localizacao.coordinates) || localizacao.coordinates.length !== 2) {
        return res.status(400).json({ message: 'Formato de localização inválido. Esperado { type: "Point", coordinates: [longitude, latitude] }' });
    }

    const propriedade = new Propriedade({
        nome,
        descricao,
        areaHectares,
        culturaPrincipal,
        localizacao,
        tags
    });

    let session;
    try {
        const novaPropriedade = await propriedade.save();

        session = neo4jDriver.session();
        const query = `
            CREATE (p:Propriedade {mongo_id: $mongoId, nome: $nome})
            ${culturaPrincipal ? `
                MERGE (c:Cultura {nome: $culturaPrincipal})
                CREATE (p)-[:PRODUZ]->(c)
            ` : ''}
            RETURN p
        `;
        await session.run(query, {
            mongoId: novaPropriedade._id.toString(),
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
            await session.close();
        }
    }
});

// Rota: Atualizar uma propriedade (UPDATE)
router.patch('/:id', getPropriedade, async (req, res) => {
    const oldCulturaPrincipal = res.propriedade.culturaPrincipal;

    if (req.body.nome != null) res.propriedade.nome = req.body.nome;
    if (req.body.descricao != null) res.propriedade.descricao = req.body.descricao;
    if (req.body.areaHectares != null) res.propriedade.areaHectares = req.body.areaHectares;
    if (req.body.culturaPrincipal != null) res.propriedade.culturaPrincipal = req.body.culturaPrincipal;
    if (req.body.localizacao != null) res.propriedade.localizacao = req.body.localizacao;
    if (req.body.tags != null) res.propriedade.tags = req.body.tags;
    res.propriedade.updatedAt = Date.now();

    let session;
    try {
        const propriedadeAtualizada = await res.propriedade.save();

        session = neo4jDriver.session();
        await session.run(
            'MATCH (p:Propriedade {mongo_id: $mongoId}) SET p.nome = $novoNome RETURN p',
            { mongoId: propriedadeAtualizada._id.toString(), novoNome: propriedadeAtualizada.nome }
        );

        if (req.body.culturaPrincipal !== undefined) {
            if (oldCulturaPrincipal && oldCulturaPrincipal !== req.body.culturaPrincipal) {
                await session.run(
                    'MATCH (p:Propriedade {mongo_id: $mongoId})-[r:PRODUZ]->(c:Cultura {nome: $oldCultura}) DELETE r',
                    { mongoId: propriedadeAtualizada._id.toString(), oldCultura: oldCulturaPrincipal }
                );
            }
            if (req.body.culturaPrincipal) {
                await session.run(
                    'MATCH (p:Propriedade {mongo_id: $mongoId}) MERGE (c:Cultura {nome: $novaCultura}) CREATE (p)-[:PRODUZ]->(c)',
                    { mongoId: propriedadeAtualizada._id.toString(), novaCultura: req.body.culturaPrincipal }
                );
            }
        }

        res.json(propriedadeAtualizada);
    } catch (err) {
        console.error("Erro ao atualizar propriedade no MongoDB ou Neo4J:", err);
        res.status(400).json({ message: err.message });
    } finally {
        if (session) {
            await session.close();
        }
    }
});

// Rota: Deletar uma propriedade (DELETE)
router.delete('/:id', getPropriedade, async (req, res) => {
    let session;
    try {
        const mongoId = res.propriedade._id.toString();
        await Propriedade.deleteOne({ _id: res.propriedade._id });

        session = neo4jDriver.session();
        await session.run(
            'MATCH (p:Propriedade {mongo_id: $mongoId}) DETACH DELETE p',
            { mongoId: mongoId }
        );
        console.log(`Nó Propriedade ${mongoId} e seus relacionamentos excluídos do Neo4J.`);

        res.json({ message: 'Propriedade excluída com sucesso' });
    } catch (err) {
        console.error("Erro ao excluir propriedade do MongoDB ou Neo4J:", err);
        res.status(500).json({ message: err.message });
    } finally {
        if (session) {
            await session.close();
        }
    }
});

// Rota: Busca textual completa (Full-text Search)
router.get('/search/:text', async (req, res) => {
    try {
        const searchText = req.params.text;
        const propriedades = await Propriedade.find(
            { $text: { $search: searchText } },
            { score: { $meta: 'textScore' } }
        ).sort({ score: { $meta: 'textScore' } });
        res.json(propriedades);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Rota: Obter relacionamentos de culturas do Neo4J
router.get("/relacionamentos/culturas", async (req, res) => {
    let session;
    try {
        session = neo4jDriver.session();
        const result = await session.run(
            `MATCH (p:Propriedade)-[:PRODUZ]->(c:Cultura)
             RETURN c.nome AS cultura, COLLECT(p.nome) AS propriedades
             ORDER BY cultura`
        );

        const culturasComPropriedades = result.records.map(record => ({
            cultura: record.get("cultura"),
            propriedades: record.get("propriedades")
        }));

        res.json(culturasComPropriedades);
    } catch (err) {
        console.error("Erro ao buscar relacionamentos de culturas no Neo4J:", err);
        res.status(500).json({ message: err.message });
    } finally {
        if (session) {
            await session.close();
        }
    }
});

module.exports = router;