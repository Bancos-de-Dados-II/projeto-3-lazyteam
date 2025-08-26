const express = require("express");
const router = express.Router();
const Propriedade = require("../models/propriedade");
const neo4jDriver = require("../config/neo4j");
const { default: fetch } = require("node-fetch");   

async function reverseGeocode(lat, lng) {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    try {
        const response = await fetch(nominatimUrl, { headers: { 'User-Agent': 'LazyTeamApp/1.0' } } );
        if (!response.ok) {
            throw new Error(`Erro HTTP na geocodificação reversa: ${response.status}`);
        }
        const data = await response.json();
        const address = data.address;
        const city = address.city || address.town || address.village || address.county || "Desconhecida";
        const state = address.state || address.region || "Desconhecido";
        return { city, state };
    } catch (error) {
        console.error("Erro na geocodificação reversa:", error);
        return { city: "Erro", state: "Erro" };
    }
}

// Função para verificar sobreposição de propriedades
async function checkOverlap(latitude, longitude, areaHectares, excludeId = null) {
    try {
        // Converter hectares para metros quadrados e calcular raio aproximado
        const areaMetrosQuadrados = areaHectares * 10000; // 1 hectare = 10.000 m²
        const raioAproximado = Math.sqrt(areaMetrosQuadrados / Math.PI); // Assumindo área circular
        
        // Buscar propriedades próximas usando consulta geoespacial
        const query = {
            localizacao: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [longitude, latitude]
                    },
                    $maxDistance: raioAproximado * 2 // Dobrar o raio para margem de segurança
                }
            }
        };
        
        // Excluir a propriedade atual se estiver atualizando
        if (excludeId) {
            query._id = { $ne: excludeId };
        }
        
        const propriedadesProximas = await Propriedade.find(query);
        
        // Verificar sobreposição mais detalhada
        for (const prop of propriedadesProximas) {
            const distancia = calcularDistancia(
                latitude, longitude,
                prop.localizacao.coordinates[1], prop.localizacao.coordinates[0]
            );
            
            // Calcular raios das duas propriedades
            const raioNova = Math.sqrt((areaHectares * 10000) / Math.PI);
            const raioExistente = Math.sqrt((prop.areaHectares * 10000) / Math.PI);
            
            // Se a distância entre os centros for menor que a soma dos raios, há sobreposição
            if (distancia < (raioNova + raioExistente)) {
                return {
                    hasOverlap: true,
                    overlappingProperty: {
                        id: prop._id,
                        nome: prop.nome,
                        area: prop.areaHectares,
                        distancia: Math.round(distancia)
                    }
                };
            }
        }
        
        return { hasOverlap: false };
    } catch (error) {
        console.error("Erro ao verificar sobreposição:", error);
        throw error;
    }
}

// Função para calcular distância entre dois pontos (fórmula de Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distância em metros
}

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

router.get('/', async (req, res) => {
    try {
        const propriedades = await Propriedade.find();
        res.json(propriedades);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id', getPropriedade, (req, res) => {
    res.json(res.propriedade);
});

router.post('/', async (req, res) => {
    const { nome, descricao, areaHectares, culturaPrincipal, localizacao, tags } = req.body;

    if (!localizacao || localizacao.type !== 'Point' || !Array.isArray(localizacao.coordinates) || localizacao.coordinates.length !== 2) {
        return res.status(400).json({ message: 'Formato de localização inválido. Esperado { type: "Point", coordinates: [longitude, latitude] }' });
    }

    const { coordinates } = localizacao;
    const [longitude, latitude] = coordinates;
    
    try {
        // Verificar sobreposição antes de criar a propriedade
        const overlapCheck = await checkOverlap(latitude, longitude, areaHectares);
        if (overlapCheck.hasOverlap) {
            return res.status(409).json({ 
                message: 'Propriedade não pode ser criada: há sobreposição com propriedade existente',
                conflictDetails: {
                    overlappingProperty: overlapCheck.overlappingProperty.nome,
                    area: overlapCheck.overlappingProperty.area,
                    distancia: overlapCheck.overlappingProperty.distancia
                }
            });
        }

        const { city, state } = await reverseGeocode(latitude, longitude);

        const propriedade = new Propriedade({
            nome,
            descricao,
            areaHectares,
            culturaPrincipal,
            localizacao,
            city,
            state,
            tags
        });

        let session;
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
        
        if (session) {
            await session.close();
        }
    } catch (err) {
        console.error("Erro ao salvar propriedade no MongoDB ou Neo4J:", err);
        res.status(400).json({ message: err.message });
    }
});

router.patch('/:id', getPropriedade, async (req, res) => {
    const oldCulturaPrincipal = res.propriedade.culturaPrincipal;
    
    // Verificar se localização ou área estão sendo alteradas
    const locationChanged = req.body.localizacao != null;
    const areaChanged = req.body.areaHectares != null;
    
    if (locationChanged || areaChanged) {
        // Obter valores para verificação de sobreposição
        const newLocation = req.body.localizacao || res.propriedade.localizacao;
        const newArea = req.body.areaHectares || res.propriedade.areaHectares;
        const [longitude, latitude] = newLocation.coordinates;
        
        try {
            // Verificar sobreposição excluindo a propriedade atual
            const overlapCheck = await checkOverlap(latitude, longitude, newArea, res.propriedade._id);
            if (overlapCheck.hasOverlap) {
                return res.status(409).json({ 
                    message: 'Propriedade não pode ser atualizada: há sobreposição com propriedade existente',
                    conflictDetails: {
                        overlappingProperty: overlapCheck.overlappingProperty.nome,
                        area: overlapCheck.overlappingProperty.area,
                        distancia: overlapCheck.overlappingProperty.distancia
                    }
                });
            }
        } catch (error) {
            console.error("Erro ao verificar sobreposição na atualização:", error);
            return res.status(500).json({ message: "Erro interno ao verificar sobreposição" });
        }
    }

    if (req.body.nome != null) res.propriedade.nome = req.body.nome;
    if (req.body.descricao != null) res.propriedade.descricao = req.body.descricao;
    if (req.body.areaHectares != null) res.propriedade.areaHectares = req.body.areaHectares;
    if (req.body.culturaPrincipal != null) res.propriedade.culturaPrincipal = req.body.culturaPrincipal;
    if (req.body.localizacao != null) {
        res.propriedade.localizacao = req.body.localizacao;
        const { coordinates } = req.body.localizacao;
        const [longitude, latitude] = coordinates;
        const { city, state } = await reverseGeocode(latitude, longitude);
        res.propriedade.city = city;
        res.propriedade.state = state;
    }
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