const API_BASE_URL = "http://localhost:5000/api/propriedades";
let map; // Variável global para o mapa Leaflet
let marker; // Variável global para o marcador de localização
let allPropriedadesMarkers = L.featureGroup(); // Grupo para marcadores de propriedades

// Configuração dos MongoDB Charts
const CHARTS_CONFIG = {
    baseUrl: "https://charts.mongodb.com/charts-project-0-qgebchr",
    charts: {
        cultura: "9bb2278c-4d8e-4f29-aafc-11d59e178f83",
        mapa: "e4350898-03dc-4c33-91c2-ee9992bbb08f",
        tabela: "736963f0-e463-49a8-a979-d77a060e00c4"
    }
};

// Variáveis para controle do dashboard
let chartsInitialized = false;
let sdk = null;

// Função para inicializar o mapa
function initMap() {
    // Tenta obter a localização atual do usuário
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(showPosition, showError, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
    } else {
        alert("Geolocalização não é suportada por este navegador.");
        // Se não suportar, centraliza em uma localização padrão (ex: Brasil)
        createMap(-14.235, -53.180); 
    }
}

function showPosition(position) {
    createMap(position.coords.latitude, position.coords.longitude);
}

function showError(error) {
    switch(error.code) {
        case error.PERMISSION_DENIED:
            alert("Usuário negou a solicitação de Geolocalização.");
            break;
        case error.POSITION_UNAVAILABLE:
            alert("Informações de localização indisponíveis.");
            break;
        case error.TIMEOUT:
            alert("A solicitação para obter a localização do usuário expirou.");
            break;
        case error.UNKNOWN_ERROR:
            alert("Um erro desconhecido ocorreu.");
            break;
    }
    // Centraliza em uma localização padrão (ex: Brasil) em caso de erro
    createMap(-14.235, -53.180); 
}

function createMap(lat, lng) {
    if (map) map.remove(); // Remove mapa existente se houver

    map = L.map("map").setView([lat, lng], 5); // Zoom inicial para o Brasil

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
    }).addTo(map);

    // Adicionar controle de geocodificação (busca de endereços) - MANTEMOS O CONTROLE VISUAL, MAS A LÓGICA SERÁ NO BOTÃO
    const geocoderControl = L.Control.geocoder({ geocoder: L.Control.Geocoder.nominatim() }).addTo(map);

    // Evento de clique no mapa para selecionar localização
    map.on("click", function(e) {
        if (marker) {
            map.removeLayer(marker);
        }
        marker = L.marker(e.latlng).addTo(map);
        document.getElementById("latitude").value = e.latlng.lat.toFixed(6);
        document.getElementById("longitude").value = e.latlng.lng.toFixed(6);
    });

    // Adicionar grupo de marcadores de propriedades ao mapa
    allPropriedadesMarkers.addTo(map);
}

// Função para buscar localização por texto (geocodificação) - LÓGICA ALTERADA PARA DIAGNÓSTICO
document.getElementById("geocodeButton").addEventListener("click", async () => {
    const searchLocation = document.getElementById("searchLocation").value;
    if (searchLocation) {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchLocation)}&format=json&limit=1&addressdetails=1`;
        
        console.log("Tentando buscar no Nominatim:", nominatimUrl); // Log da URL

        try {
            const response = await fetch(nominatimUrl);
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            const results = await response.json();
            
            console.log("Resultados brutos do Nominatim:", results); // Log dos resultados brutos

            if (results && results.length > 0) {
                const lat = parseFloat(results[0].lat);
                const lng = parseFloat(results[0].lon);
                const latlng = L.latLng(lat, lng);

                map.setView(latlng, 13); // Centraliza o mapa na localização encontrada
                if (marker) {
                    map.removeLayer(marker);
                }
                marker = L.marker(latlng).addTo(map);
                document.getElementById("latitude").value = lat.toFixed(6);
                document.getElementById("longitude").value = lng.toFixed(6);
            } else {
                alert("Localização não encontrada.");
            }
        } catch (error) {
            console.error("Erro na geocodificação:", error); // Log de qualquer erro na requisição
            alert(`Erro na geocodificação: ${error.message}`);
        }
    } else {
        alert("Por favor, digite um endereço para buscar.");
    }
});

// Função para alternar dashboard
function toggleDashboard() {
    const content = document.getElementById("dashboard-content");
    const toggleText = document.getElementById("dashboard-toggle-text");
    
    if (content.classList.contains("active")) {
        content.classList.remove("active");
        toggleText.textContent = "Mostrar Dashboard";
    } else {
        content.classList.add("active");
        toggleText.textContent = "Ocultar Dashboard";
        
        // Inicializar charts se ainda não foram inicializados
        if (!chartsInitialized) {
            initCharts();
            chartsInitialized = true;
        }
        
        // Atualizar estatísticas
        updateStatistics();
    }
}

// Função para inicializar MongoDB Charts
async function initCharts() {
    try {
        // Inicializar SDK
        sdk = new ChartsEmbedSDK({
            baseUrl: CHARTS_CONFIG.baseUrl
        });

        // Renderizar charts
        await Promise.all([
            renderChart(CHARTS_CONFIG.charts.cultura, "chart-cultura", "400px"),
            renderChart(CHARTS_CONFIG.charts.mapa, "chart-mapa", "500px"),
            renderChart(CHARTS_CONFIG.charts.tabela, "chart-tabela", "400px")
        ]);
        
        console.log("Charts inicializados com sucesso!");
    } catch (error) {
        console.error("Erro ao inicializar charts:", error);
    }
}

// Função para renderizar um chart
async function renderChart(chartId, containerId, height = "400px") {
    try {
        const chart = sdk.createChart({
            chartId: chartId,
            height: height,
            width: "100%"
        });

        await chart.render(document.getElementById(containerId));
        
        // Remover loading
        const loadingElement = document.querySelector(`#${containerId} .loading`);
        if (loadingElement) {
            loadingElement.remove();
        }
        
        console.log(`Chart ${containerId} renderizado com sucesso`);
    } catch (error) {
        console.error(`Erro ao renderizar chart ${containerId}:`, error);
        
        // Mostrar erro
        const container = document.getElementById(containerId);
        container.innerHTML = '<div class="error">Erro ao carregar gráfico</div>';
    }
}

// Função para atualizar estatísticas
async function updateStatistics() {
    try {
        const response = await fetch(API_BASE_URL);
        const propriedades = await response.json();

        if (propriedades && propriedades.length > 0) {
            const totalPropriedades = propriedades.length;
            const areaTotal = propriedades.reduce((sum, prop) => sum + (prop.areaHectares || 0), 0);
            const culturas = [...new Set(propriedades.map(prop => prop.culturaPrincipal).filter(Boolean))];
            const areaMedia = areaTotal / totalPropriedades;

            document.getElementById("total-propriedades").textContent = totalPropriedades;
            document.getElementById("area-total").textContent = areaTotal.toLocaleString("pt-BR", {maximumFractionDigits: 0});
            document.getElementById("culturas-diferentes").textContent = culturas.length;
            document.getElementById("area-media").textContent = areaMedia.toLocaleString("pt-BR", {maximumFractionDigits: 1});
        } else {
            // Valores padrão quando não há dados
            document.getElementById("total-propriedades").textContent = "0";
            document.getElementById("area-total").textContent = "0";
            document.getElementById("culturas-diferentes").textContent = "0";
            document.getElementById("area-media").textContent = "0";
        }
    } catch (error) {
        console.error("Erro ao carregar estatísticas:", error);
    }
}

// Função para carregar propriedades da API
async function loadPropriedades(searchText = "") {
    const propriedadesListDiv = document.getElementById("propriedadesList");
    propriedadesListDiv.innerHTML = ""; // Limpa a lista
    allPropriedadesMarkers.clearLayers(); // Limpa marcadores do mapa

    let url = API_BASE_URL;
    if (searchText) {
        url = `${API_BASE_URL}/search/${encodeURIComponent(searchText)}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const propriedades = await response.json();

        if (propriedades.length === 0) {
            propriedadesListDiv.innerHTML = "<p>Nenhuma propriedade encontrada.</p>";
            return;
        }

        propriedades.forEach(propriedade => {
            const card = document.createElement("div");
            card.className = "propriedade-card";
            card.innerHTML = `
                <h3>${propriedade.nome}</h3>
                <p><strong>Descrição:</strong> ${propriedade.descricao || "N/A"}</p>
                <p><strong>Área:</strong> ${propriedade.areaHectares} ha</p>
                <p><strong>Cultura:</strong> ${propriedade.culturaPrincipal || "N/A"}</p>
                <p><strong>Localização:</strong> ${propriedade.localizacao.coordinates[1].toFixed(6)}, ${propriedade.localizacao.coordinates[0].toFixed(6)}</p>
                <div class="tags">
                    ${propriedade.tags ? propriedade.tags.map(tag => `<span>${tag}</span>`).join("") : ""}
                </div>
                <div class="actions">
                    <button class="edit-btn" data-id="${propriedade._id}">Editar</button>
                    <button class="delete-btn" data-id="${propriedade._id}">Excluir</button>
                </div>
            `;
            propriedadesListDiv.appendChild(card);

            // Adicionar marcador ao mapa
            if (propriedade.localizacao && propriedade.localizacao.coordinates) {
                const lat = propriedade.localizacao.coordinates[1];
                const lng = propriedade.localizacao.coordinates[0];
                const propMarker = L.marker([lat, lng]).bindPopup(`
                    <b>${propriedade.nome}</b><br>
                    Área: ${propriedade.areaHectares} ha<br>
                    Cultura: ${propriedade.culturaPrincipal || "N/A"}
                `);
                allPropriedadesMarkers.addLayer(propMarker);
            }
        });

        // Adicionar listeners para botões de editar e excluir
        document.querySelectorAll(".edit-btn").forEach(button => {
            button.addEventListener("click", (e) => editPropriedade(e.target.dataset.id));
        });
        document.querySelectorAll(".delete-btn").forEach(button => {
            button.addEventListener("click", (e) => deletePropriedade(e.target.dataset.id));
        });

        // Atualizar estatísticas se o dashboard estiver aberto
        if (document.getElementById("dashboard-content") && document.getElementById("dashboard-content").classList.contains("active")) {
            updateStatistics();
        }

    } catch (error) {
        console.error("Erro ao carregar propriedades:", error);
        propriedadesListDiv.innerHTML = "<p>Erro ao carregar propriedades. Verifique a conexão com a API.</p>";
    }
}

// Função para enviar formulário (criar/atualizar)
document.getElementById("propriedadeForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const propriedadeId = document.getElementById("propriedadeId").value;
    const nome = document.getElementById("nome").value;
    const descricao = document.getElementById("descricao").value;
    const areaHectares = parseFloat(document.getElementById("areaHectares").value);
    const culturaPrincipal = document.getElementById("culturaPrincipal").value;
    const tags = document.getElementById("tags").value.split(",").map(tag => tag.trim()).filter(tag => tag !== "");
    const latitude = parseFloat(document.getElementById("latitude").value);
    const longitude = parseFloat(document.getElementById("longitude").value);

    if (isNaN(latitude) || isNaN(longitude)) {
        alert("Por favor, selecione a localização no mapa ou use a busca.");
        return;
    }

    const propriedadeData = {
        nome,
        descricao,
        areaHectares,
        culturaPrincipal,
        tags,
        localizacao: {
            type: "Point",
            coordinates: [longitude, latitude] // GeoJSON: [longitude, latitude]
        }
    };

    try {
        let response;
        if (propriedadeId) { // Atualizar
            response = await fetch(`${API_BASE_URL}/${propriedadeId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(propriedadeData)
            });
        } else { // Criar
            response = await fetch(API_BASE_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(propriedadeData)
            });
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        alert("Propriedade salva com sucesso!");
        clearForm();
        loadPropriedades(); // Recarrega a lista e o mapa
    } catch (error) {
        console.error("Erro ao salvar propriedade:", error);
        alert(`Erro ao salvar propriedade: ${error.message}`);
    }
});

// Função para preencher formulário para edição
async function editPropriedade(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/${id}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const propriedade = await response.json();

        document.getElementById("propriedadeId").value = propriedade._id;
        document.getElementById("nome").value = propriedade.nome;
        document.getElementById("descricao").value = propriedade.descricao || "";
        document.getElementById("areaHectares").value = propriedade.areaHectares;
        document.getElementById("culturaPrincipal").value = propriedade.culturaPrincipal || "";
        document.getElementById("tags").value = propriedade.tags ? propriedade.tags.join(", ") : "";
        
        // Preencher lat/lng e mover marcador
        if (propriedade.localizacao && propriedade.localizacao.coordinates) {
            const lat = propriedade.localizacao.coordinates[1];
            const lng = propriedade.localizacao.coordinates[0];
            document.getElementById("latitude").value = lat.toFixed(6);
            document.getElementById("longitude").value = lng.toFixed(6);
            if (marker) {
                map.removeLayer(marker);
            }
            marker = L.marker([lat, lng]).addTo(map);
            map.setView([lat, lng], 13); // Centraliza o mapa na propriedade
        }

        document.getElementById("cancelEdit").style.display = "inline-block";
    } catch (error) {
        console.error("Erro ao carregar propriedade para edição:", error);
        alert("Erro ao carregar propriedade para edição.");
    }
}

// Função para deletar propriedade
async function deletePropriedade(id) {
    if (confirm("Tem certeza que deseja excluir esta propriedade?")) {
        try {
            const response = await fetch(`${API_BASE_URL}/${id}`, {
                method: "DELETE"
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            alert("Propriedade excluída com sucesso!");
            loadPropriedades(); // Recarrega a lista e o mapa
        } catch (error) {
            console.error("Erro ao excluir propriedade:", error);
            alert(`Erro ao excluir propriedade: ${error.message}`);
        }
    }
}

// Função para limpar o formulário
function clearForm() {
    document.getElementById("propriedadeForm").reset();
    document.getElementById("propriedadeId").value = "";
    document.getElementById("cancelEdit").style.display = "none";
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    document.getElementById("latitude").value = "";
    document.getElementById("longitude").value = "";
}

document.getElementById("cancelEdit").addEventListener("click", clearForm);

// Função de busca textual
document.getElementById("searchButton").addEventListener("click", () => {
    const searchText = document.getElementById("searchText").value;
    loadPropriedades(searchText);
});

document.getElementById("searchText").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        document.getElementById("searchButton").click();
    }
});

// Event listener para o botão do dashboard
const dashboardToggleButton = document.getElementById("dashboard-toggle");
if (dashboardToggleButton) {
    dashboardToggleButton.addEventListener("click", toggleDashboard);
}

// Inicializar mapa e carregar propriedades ao carregar a página
document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadPropriedades();
});