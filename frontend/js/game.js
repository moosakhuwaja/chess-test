document.addEventListener("DOMContentLoaded", () => {
  // Extract room ID from URL
  const pathParts = window.location.pathname.split("/");
  const roomId = pathParts[pathParts.length - 1];
  document.getElementById("room-id-display").textContent = roomId;

  // Extract query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const role = urlParams.get("role") || "watcher";
  const color = urlParams.get("color") || null;

  // Initialize chessboard
  const board = Chessboard("board", {
    draggable: true,
    position: "start",
    orientation: "white", // Default orientation
    onDrop: handleMove,
    pieceTheme:
      "/assets/chessboardjs-1.0.0/img/chesspieces/wikipedia/{piece}.png"
  });
  // Initialize chess.js game for client-side validation
  const game = new Chess();

  // Connect to Socket.IO
  const socket = io();

  // Game state variables
  let currentRole = role;
  let playerColor = null;
  let gameStatus = "loading";

  // Join the room
  socket.emit("join_room", {
    room_id: roomId,
    role: role,
    color: color
  });

  // Handle game state updates
  socket.on("game_state", (state) => {
    updateGameState(state);
  });

  // Handle move made by opponent
  socket.on("move_made", (data) => {
    game.move(data.move);
    board.position(game.fen());
    updateMoveHistory(data.move);

    if (data.status !== "ongoing") {
      gameStatus = data.status;
      updateGameStatus();
    }
  });

  // Handle game ending
  socket.on("game_ended", (result) => {
    gameStatus = result.status;
    document.getElementById(
      "game-status"
    ).textContent = `Game ended: ${result.status} (${result.result})`;
    document.getElementById("game-controls").classList.add("hidden");
  });

  // Handle draw offer
  socket.on("draw_offered", (data) => {
    if (data.offered_by !== socket.id && currentRole === "player") {
      document.getElementById("draw-offer").classList.remove("hidden");
    }
  });

  // Update game state from server
  function updateGameState(state) {
    game.load(state.fen); // Set board orientation based on player color
    if (currentRole === "player") {
      if (socket.id === state.white_player) {
        playerColor = "white";
        board.orientation("white");
      } else if (socket.id === state.black_player) {
        playerColor = "black";
        board.orientation("black");
      }
    } else {
      // Default to white orientation for watchers
      board.orientation("white");
    }

    board.position(state.fen);

    // Update player info
    document.getElementById("white-player").textContent = state.white_player
      ? state.white_player.substring(0, 8)
      : "Waiting...";
    document.getElementById("black-player").textContent = state.black_player
      ? state.black_player.substring(0, 8)
      : "Waiting...";
    document.getElementById("watchers-count").textContent = state.watchers
      ? state.watchers.length
      : 0;

    // Update game status
    gameStatus = state.status;
    updateGameStatus();

    // Update move history
    document.getElementById("move-history").innerHTML = "";
    state.move_history.forEach((move, i) => {
      const moveEl = document.createElement("div");
      moveEl.textContent = `${i + 1}. ${move}`;
      document.getElementById("move-history").appendChild(moveEl);
    });

    // Set player color if we're a player
    if (currentRole === "player") {
      if (socket.id === state.white_player) {
        playerColor = "white";
      } else if (socket.id === state.black_player) {
        playerColor = "black";
      }
    }

    // Show/hide controls based on role and turn
    updateControls(state);
  }

  // Update game status display
  function updateGameStatus() {
    let statusText = "";

    if (gameStatus === "ongoing") {
      statusText = game.turn() === "w" ? "White to move" : "Black to move";

      if (game.in_check()) {
        statusText += " (Check!)";
      }
    } else if (gameStatus === "checkmate") {
      statusText = `Checkmate! ${game.turn() === "w" ? "Black" : "White"} wins`;
    } else if (gameStatus === "stalemate") {
      statusText = "Stalemate! Game drawn";
    } else if (gameStatus === "draw") {
      statusText = "Game drawn";
    } else if (gameStatus === "resigned") {
      statusText = "Game ended by resignation";
    }

    document.getElementById("game-status").textContent = statusText;
  }

  // Update controls visibility
  function updateControls(state) {
    const controls = document.getElementById("game-controls");

    if (currentRole === "player" && state.status === "ongoing") {
      controls.classList.remove("hidden");

      // Only show offer draw if it's not already offered
      document.getElementById("offer-draw-btn").style.display =
        state.draw_offered_by ? "none" : "inline-block";
    } else {
      controls.classList.add("hidden");
    }
  }

  // Handle piece movement
  function handleMove(source, target) {
    // Only allow moves if we're a player and it's our turn
    if (currentRole !== "player" || gameStatus !== "ongoing") {
      return "snapback";
    }

    if (
      (playerColor === "white" && game.turn() !== "w") ||
      (playerColor === "black" && game.turn() !== "b")
    ) {
      return "snapback";
    }

    // Try to make the move
    const move = game.move({
      from: source,
      to: target,
      promotion: "q" // Always promote to queen for simplicity
    });

    // If illegal move, snap back
    if (move === null) return "snapback";

    // Send move to server
    socket.emit("make_move", {
      room_id: roomId,
      move: move.san
    });

    updateMoveHistory(move.san);
    return true;
  }

  // Update move history display
  function updateMoveHistory(move) {
    const moveEl = document.createElement("div");
    const moveNumber = Math.ceil(game.history().length / 2);

    if (game.history().length % 2 === 1) {
      moveEl.textContent = `${moveNumber}. ${move}`;
    } else {
      moveEl.textContent = move;
    }

    document.getElementById("move-history").appendChild(moveEl);
    document.getElementById("move-history").scrollTop =
      document.getElementById("move-history").scrollHeight;
  }

  // Resign button handler
  document.getElementById("resign-btn").addEventListener("click", () => {
    if (confirm("Are you sure you want to resign?")) {
      socket.emit("resign", { room_id: roomId });
    }
  });

  // Offer draw button handler
  document.getElementById("offer-draw-btn").addEventListener("click", () => {
    if (confirm("Offer draw to your opponent?")) {
      socket.emit("offer_draw", { room_id: roomId });
      document.getElementById("offer-draw-btn").style.display = "none";
    }
  });

  // Accept draw button handler
  document.getElementById("accept-draw-btn").addEventListener("click", () => {
    socket.emit("accept_draw", { room_id: roomId });
    document.getElementById("draw-offer").classList.add("hidden");
  });

  // Handle beforeunload to notify server
  window.addEventListener("beforeunload", () => {
    socket.emit("leave_room", { room_id: roomId });
  });
});
