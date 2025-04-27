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
  // Modify the join button click handler
  joinBtn.addEventListener("click", () => {
    const roomId = roomIdInput.value.trim() || generateRoomId();
    const role = joinRoleSelect.value;
    const color = role === "player" ? playerColorSelect.value : null;

    // Check if we're trying to join an existing room as player
    if (role === "player" && roomIdInput.value.trim()) {
      socket.emit("check_room", { room_id: roomId });
    } else {
      window.location.href = `/game/${roomId}?role=${role}&color=${color}`;
    }
  });

  // Add this handler for check_room responses
  socket.on("check_room_response", (response) => {
    const roomId = response.room_id;
    const role = joinRoleSelect.value;
    const color = role === "player" ? playerColorSelect.value : null;

    if (response.is_full) {
      if (
        confirm("This room already has 2 players. Join as watcher instead?")
      ) {
        window.location.href = `/game/${roomId}?role=watcher`;
      }
    } else {
      window.location.href = `/game/${roomId}?role=${role}&color=${color}`;
    }
  });

  // Add this to your Socket.IO connection
  socket.on("connect", () => {
    socket.emit("get_games");

    // Add the check_room handler
    socket.on("check_room_response", (response) => {
      // This is handled in the callback above
    });
  });

  // Generate a random room ID if not specified
  function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
  }

  // Load game lists
  socket.on("games_list", (games) => {
    renderGamesList(games.live_games, liveGamesDiv, "live");
    // Show all ended games, not just recent ones
    renderGamesList(
      games.all_games.filter((g) => g.status !== "ongoing"),
      endedGamesDiv,
      "ended"
    );
  });

  function renderGamesList(games, container, type) {
    container.innerHTML = "";

    if (games.length === 0) {
      container.innerHTML = `<p>No ${type} games found.</p>`;
      return;
    }

    // Sort games by end time (newest first)
    games.sort(
      (a, b) =>
        new Date(b.end_time || b.start_time) -
        new Date(a.end_time || a.start_time)
    );

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

      const timeInfo = game.end_time
        ? new Date(game.end_time).toLocaleString()
        : new Date(game.start_time).toLocaleString();

      gameEl.innerHTML = `
            <h3>Game: ${game.room_id}</h3>
            <p>${playersInfo}</p>
            <p>${resultInfo}</p>
            <p class="game-time">${timeInfo}</p>
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
