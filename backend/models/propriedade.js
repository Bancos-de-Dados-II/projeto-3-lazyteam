const mongoose = require('mongoose');

const PropriedadeSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: [true, 'O nome da propriedade é obrigatório'],
        trim: true
    },
    descricao: {
        type: String,
        trim: true
    },
    areaHectares: {
        type: Number,
        required: [true, 'A área em hectares é obrigatória'],
        min: [0, 'A área não pode ser negativa']
    },
    culturaPrincipal: {
        type: String,
        trim: true
    },
    // Campo para localização GeoJSON (Point)
    localizacao: {
        type: {
            type: String, // Tipo GeoJSON, deve ser 'Point'
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true,
            validate: {
                validator: function(v) {
                    return v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
                },
                message: 'As coordenadas devem ser um array de [longitude, latitude]'
            }
        }
    },
    // Campos para Full-text Search
    tags: {
        type: [String],
        index: true // Opcional: para buscas simples por tags
    },
    // Timestamps automáticos
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Criar índice 2dsphere para consultas geoespaciais
PropriedadeSchema.index({ localizacao: '2dsphere' });

// Criar índice de texto para Full-text Search
PropriedadeSchema.index({ 
    nome: 'text', 
    descricao: 'text', 
    culturaPrincipal: 'text', 
    tags: 'text' 
}, { 
    weights: { 
        nome: 10, 
        descricao: 5, 
        culturaPrincipal: 3, 
        tags: 8 
    }, 
    name: 'text_search_index' 
});

module.exports = mongoose.model('Propriedade', PropriedadeSchema);
