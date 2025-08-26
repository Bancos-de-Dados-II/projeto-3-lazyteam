const API_BASE_URL = "http://localhost:5000/api/propriedades";
let map;
let marker; 
let allPropriedadesMarkers = L.featureGroup( );

let currentPage = 1;
const propertiesPerPage = 8;
let totalProperties = 0;

function initMap() {
    map = L.map("map").setView([-15.7801, -47.9292], 4); // Centra no Brasil

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    } ).addTo(map);

    document.getElementById("geocodeButton").addEventListener("click", async function() {
        const query = document.getElementById("searchLocation").value;
        console.log("Search query (direct fetch):", query);

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query )}&format=json&limit=1`);
            const results = await response.json();
            console.log("Geocoder results (direct fetch):", results);

            if (results && results.length > 0) {
                const lat = parseFloat(results[0].lat);
                const lng = parseFloat(results[0].lon);
                const latlng = L.latLng(lat, lng);

                map.setView(latlng, 13);
                if (marker) {
                    map.removeLayer(marker);
                }
                marker = L.marker(latlng).addTo(map);
                document.getElementById("latitude").value = lat.toFixed(6);
                document.getElementById("longitude").value = lng.toFixed(6);
            } else {
                alert("Endereço não encontrado.");
            }
        } catch (error) {
            console.error("Erro na geocodificação:", error);
            alert("Erro ao buscar localização.");
        }
    });

    map.on("click", function(e) {
        if (marker) {
            map.removeLayer(marker);
        }
        marker = L.marker(e.latlng).addTo(map);
        document.getElementById("latitude").value = e.latlng.lat.toFixed(6);
        document.getElementById("longitude").value = e.latlng.lng.toFixed(6);
    });
}

async function loadPropriedades(searchText = "") {
    try {
        const url = searchText ? `${API_BASE_URL}/search/${searchText}` : API_BASE_URL;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Erro ao carregar propriedades");
        const propriedades = await response.json();
        totalProperties = propriedades.length;

        const startIndex = (currentPage - 1) * propertiesPerPage;
        const endIndex = startIndex + propertiesPerPage;
        const paginatedProperties = propriedades.slice(startIndex, endIndex);

        const propriedadesListDiv = document.getElementById("propriedadesList");
        propriedadesListDiv.innerHTML = "";
        allPropriedadesMarkers.clearLayers(); 

        if (paginatedProperties.length === 0) {
            propriedadesListDiv.innerHTML = "<p>Nenhuma propriedade encontrada.</p>";
            updatePaginationControls();
            return;
        }

        paginatedProperties.forEach(propriedade => {
        const card = document.createElement("div");
        card.className = "propriedade-card";
        card.innerHTML = `
            <h3>${propriedade.nome}</h3>
            <p><strong>Descrição:</strong> ${propriedade.descricao || "N/A"}</p>
            <p><strong>Área:</strong> ${propriedade.areaHectares} ha</p>
            <p><strong>Cultura Principal:</strong> ${propriedade.culturaPrincipal || "N/A"}</p>
            <p><strong>Localização:</strong> ${propriedade.city && propriedade.state ? `${propriedade.city}, ${propriedade.state}` : `${propriedade.localizacao.coordinates[1].toFixed(6)}, ${propriedade.localizacao.coordinates[0].toFixed(6)}`}</p>
            <p><strong>Tags:</strong> ${propriedade.tags && propriedade.tags.length > 0 ? propriedade.tags.join(", ") : "N/A"}</p>
            <div class="actions">
                <button class="edit-btn" data-id="${propriedade._id}">Editar</button>
                <button class="delete-btn" data-id="${propriedade._id}">Excluir</button>
            </div>
        `;

        card.addEventListener("click", () => {
            if (propriedade.localizacao && propriedade.localizacao.coordinates) {
                const lat = propriedade.localizacao.coordinates[1];
                const lng = propriedade.localizacao.coordinates[0];
                map.setView([lat, lng], 13); // Centraliza o mapa na propriedade
                if (marker) {
                    map.removeLayer(marker);
                }
                marker = L.marker([lat, lng]).addTo(map);
                document.querySelector(".map-container").scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });

        propriedadesListDiv.appendChild(card);

        // Adiciona o marcador ao carregar as propriedades
        if (propriedade.localizacao && propriedade.localizacao.coordinates) {
            L.marker([propriedade.localizacao.coordinates[1], propriedade.localizacao.coordinates[0]]).addTo(map)
                .bindPopup(`<b>${propriedade.nome}</b>  
    ${propriedade.city}, ${propriedade.state || ''}`).openPopup();
        }
    });


        document.querySelectorAll(".edit-btn").forEach(button => {
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                editPropriedade(e.target.dataset.id);
            });
        });

        document.querySelectorAll(".delete-btn").forEach(button => {
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                deletePropriedade(e.target.dataset.id);
            });
        });

        updatePaginationControls();

    } catch (error) {
        console.error("Erro:", error);
        document.getElementById("propriedadesList").innerHTML = "<p class=\"text-danger\">Falha ao carregar propriedades.</p>";
    }
}

// Função para atualizar os controles de paginação
function updatePaginationControls() {
    const pageInfo = document.getElementById("pageInfo");
    const prevPageButton = document.getElementById("prevPageButton");
    const nextPageButton = document.getElementById("nextPageButton");

    const totalPages = Math.ceil(totalProperties / propertiesPerPage);

    pageInfo.textContent = `Página ${currentPage} de ${totalPages || 1}`;

    prevPageButton.disabled = currentPage === 1;
    nextPageButton.disabled = currentPage === totalPages || totalPages === 0;
}

document.getElementById("propriedadeForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = document.getElementById("propriedadeId").value;
    const nome = document.getElementById("nome").value;
    const descricao = document.getElementById("descricao").value;
    const areaHectares = parseFloat(document.getElementById("areaHectares").value);
    const culturaPrincipal = document.getElementById("culturaPrincipal").value;
    const tags = document.getElementById("tags").value.split(",").map(tag => tag.trim()).filter(tag => tag !== "");
    const latitude = parseFloat(document.getElementById("latitude").value);
    const longitude = parseFloat(document.getElementById("longitude").value);

    if (isNaN(latitude) || isNaN(longitude)) {
        alert("Por favor, selecione uma localização no mapa.");
        return;
    }

    const localizacao = {
        type: "Point",
        coordinates: [longitude, latitude]
    };

    const propriedadeData = {
        nome,
        descricao,
        areaHectares,
        culturaPrincipal,
        localizacao,
        tags
    };

    try {
        let response;
        if (id) {
            response = await fetch(`${API_BASE_URL}/${id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(propriedadeData)
            });
        } else {
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
            throw new Error(errorData.message || "Erro ao salvar propriedade");
        }

        alert("Propriedade salva com sucesso!");
        clearForm();
        loadPropriedades();
        carregarRelacionamentosCulturas();
        loadDashboardData(); 
    } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao salvar propriedade: " + error.message);
    }
});

async function editPropriedade(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/${id}`);
        if (!response.ok) throw new Error("Erro ao buscar propriedade para edição");
        const propriedade = await response.json();

        document.getElementById("propriedadeId").value = propriedade._id;
        document.getElementById("nome").value = propriedade.nome;
        document.getElementById("descricao").value = propriedade.descricao || "";
        document.getElementById("areaHectares").value = propriedade.areaHectares;
        document.getElementById("culturaPrincipal").value = propriedade.culturaPrincipal || "";
        document.getElementById("tags").value = propriedade.tags ? propriedade.tags.join(", ") : "";

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
        document.querySelector(".form-container").scrollIntoView({ behavior: "smooth", block: "start" });

    } catch (error) {
        console.error("Erro ao carregar propriedade para edição:", error);
        alert("Erro ao carregar propriedade para edição: " + error.message);
    }
}

async function deletePropriedade(id) {
    if (!confirm("Tem certeza que deseja excluir esta propriedade?")) {
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/${id}`, {
            method: "DELETE"
        });
        if (!response.ok) throw new Error("Erro ao excluir propriedade");
        alert("Propriedade excluída com sucesso!");
        loadPropriedades();
        carregarRelacionamentosCulturas();
        loadDashboardData(); 
    } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao excluir propriedade: " + error.message);
    }
}

function clearForm() {
    document.getElementById("propriedadeId").value = "";
    document.getElementById("nome").value = "";
    document.getElementById("descricao").value = "";
    document.getElementById("areaHectares").value = "";
    document.getElementById("culturaPrincipal").value = "";
    document.getElementById("tags").value = "";
    document.getElementById("latitude").value = "";
    document.getElementById("longitude").value = "";
    if (marker) {
        map.removeLayer(marker);
    }
    document.getElementById("cancelEdit").style.display = "none";
}

document.getElementById("cancelEdit").addEventListener("click", clearForm);

async function loadDashboardData() {
    try {
        const response = await fetch(`${API_BASE_URL}`);
        if (!response.ok) throw new Error("Erro ao carregar dados para o dashboard");
        const propriedades = await response.json();

        // Estatísticas 
        document.getElementById("total-propriedades").textContent = propriedades.length;
        const areaTotal = propriedades.reduce((sum, p) => sum + p.areaHectares, 0);
        document.getElementById("area-total").textContent = `${areaTotal.toFixed(2)} ha`;
        const culturas = new Set(propriedades.map(p => p.culturaPrincipal).filter(c => c));
        document.getElementById("culturas-diferentes").textContent = culturas.size;
        const areaMedia = propriedades.length > 0 ? areaTotal / propriedades.length : 0;
        document.getElementById("area-media").textContent = `${areaMedia.toFixed(2)} ha`;

        if (typeof ChartsEmbedSDK === 'undefined') {
            console.warn('MongoDB Charts Embed SDK não carregado. Verifique a tag script no HTML.');
            document.getElementById("dashboard-content").innerHTML = "<p class=\"text-danger\">MongoDB Charts Embed SDK não carregado. Verifique a conexão com a internet ou a tag script no HTML.</p>";
            return;
        }

        const sdk = new ChartsEmbedSDK({
            baseUrl: "https://charts.mongodb.com/charts-project-0-qgebchr",
        } );

        // Gráfico de Distribuição por Cultura Principal
        const chartCultura = sdk.createChart({
            chartId: "9bb2278c-4d8e-4f29-aafc-11d59e178f83", // Substitui pelo ID do gráfico de cultura
            height: "300px",
            width: "100%"
        });
        chartCultura.render(document.getElementById("chart-cultura"));

        // Gráfico de Distribuição Geográfica
        const chartMapa = sdk.createChart({
            chartId: "e4350898-03dc-4c33-91c2-ee9992bbb08f", // Substitui pelo ID do gráfico na tabela
            height: "300px",
            width: "100%"
        });
        chartMapa.render(document.getElementById("chart-mapa"));

        // Tabela de Maiores Propriedades
        const chartTabela = sdk.createChart({
            chartId: "736963f0-e463-49a8-a979-d77a060e00c4",
            height: "300px",
            width: "100%"
        });
        chartTabela.render(document.getElementById("chart-tabela"));

    } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
        document.getElementById("dashboard-content").innerHTML = "<p class=\"text-danger\">Falha ao carregar dados do dashboard: " + error.message + ".</p>";
    }
}

async function carregarRelacionamentosCulturas() {
    try {
        const response = await fetch(`${API_BASE_URL}/relacionamentos/culturas`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao buscar relacionamentos de culturas: ${response.status} - ${errorText}`);
        }
        const relacionamentos = await response.json();

        const container = document.getElementById("relacionamentos-culturas-container");
        container.innerHTML = "";

        if (relacionamentos.length === 0) {
            container.innerHTML = "<p>Nenhum relacionamento de cultura encontrado.</p>";
            return;
        }

        relacionamentos.forEach(rel => {
            const div = document.createElement("div");
            div.className = "list-group-item";
            div.innerHTML = `
                <h5>Cultura: ${rel.cultura}</h5>
                <p>Propriedades: ${rel.propriedades.join(", ")}</p>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error("Erro ao carregar relacionamentos:", error);
        const container = document.getElementById("relacionamentos-culturas-container");
        container.innerHTML = "<p class=\"text-danger\">Falha ao carregar relacionamentos: " + error.message + ".</p>";
    }
}

document.getElementById("propriedadeForm").addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        if (event.target.tagName === "INPUT" && event.target.type !== "submit" && event.target.type !== "button") {
            event.preventDefault();
            
            const formElements = Array.from(this.elements);
            const index = formElements.indexOf(event.target);
            
            if (event.target.id === "searchLocation") {
                document.getElementById("geocodeButton").click();
            } else if (index > -1 && index < formElements.length - 1) {
                for (let i = index + 1; i < formElements.length; i++) {
                    if (formElements[i].focus) {
                        formElements[i].focus();
                        break;
                    }
                }
            }
        }
    }
});

document.addEventListener("DOMContentLoaded", () => {
    initMap();
    loadPropriedades();
    carregarRelacionamentosCulturas();
    loadDashboardData(); 

    document.getElementById("searchButton").addEventListener("click", () => {
        const searchText = document.getElementById("searchText").value;
        currentPage = 1; 
        loadPropriedades(searchText);
    });

    document.getElementById("prevPageButton").addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            loadPropriedades(document.getElementById("searchText").value);
        }
    });

    document.getElementById("nextPageButton").addEventListener("click", () => {
        const totalPages = Math.ceil(totalProperties / propertiesPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            loadPropriedades(document.getElementById("searchText").value);
        }
    });
});
