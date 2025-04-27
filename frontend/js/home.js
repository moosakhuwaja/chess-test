document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const roomIdInput = document.getElementById("room-id");
  const joinRoleSelect = document.getElementById("join-role");
  const playerColorSelect = document.getElementById("player-color");
  const colorSelectionDiv = document.getElementById("color-selection");
  const joinBtn = document.getElementById("join-btn");
  const liveGamesDiv = document.getElementById("live-games");
  const endedGamesDiv = document.getElementById("ended-games");

  // Update color selection visibility based on role
  joinRoleSelect.addEventListener("change", () => {
    colorSelectionDiv.style.display =
      joinRoleSelect.value === "player" ? "block" : "none";
  });

  // Join game button handler
  joinBtn.addEventListener("click", () => {
    const roomId = roomIdInput.value.trim() || generateRoomId();
    const role = joinRoleSelect.value;
    const color = role === "player" ? playerColorSelect.value : null;

    window.location.href = `/game/${roomId}?role=${role}&color=${color}`;
  });

  // Generate a random room ID if not specified
  function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
  }

  // Load game lists
  socket.on("connect", () => {
    socket.emit("get_games");
  });

  socket.on("games_list", (games) => {
    renderGamesList(games.live_games, liveGamesDiv, "live");
    renderGamesList(games.ended_games, endedGamesDiv, "ended");
  });

  function renderGamesList(games, container, type) {
    container.innerHTML = "";

    if (games.length === 0) {
      container.innerHTML = `<p>No ${type} games found.</p>`;
      return;
    }

    games.forEach((game) => {
      const gameEl = document.createElement("div");
      gameEl.className = "game-card";

      const playersInfo =
        game.white && game.black
          ? `White: ${game.white.substring(
              0,
              8
            )} vs Black: ${game.black.substring(0, 8)}`
          : "Waiting for players";

      const resultInfo = game.result
        ? `Result: ${game.result}`
        : "Game in progress";

      gameEl.innerHTML = `
                <h3>Game: ${game.room_id}</h3>
                <p>${playersInfo}</p>
                <p>${resultInfo}</p>
                <div class="game-actions">
                    <button class="join-as-player" data-room="${game.room_id}">Join as Player</button>
                    <button class="join-as-watcher" data-room="${game.room_id}">Watch Game</button>
                </div>
            `;

      container.appendChild(gameEl);
    });

    // Add event listeners to join buttons
    container.querySelectorAll(".join-as-player").forEach((btn) => {
      btn.addEventListener("click", () => {
        const roomId = btn.dataset.room;
        window.location.href = `/game/${roomId}?role=player&color=random`;
      });
    });

    container.querySelectorAll(".join-as-watcher").forEach((btn) => {
      btn.addEventListener("click", () => {
        const roomId = btn.dataset.room;
        window.location.href = `/game/${roomId}?role=watcher`;
      });
    });
  }
});
