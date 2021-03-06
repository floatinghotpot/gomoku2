
var GoBoard = function( rows ){
	hotjs.base(this);
	
	if(! rows) rows = 15;
	
	this.gridStyle = true;
	
	this.rows = rows;
    this.hostColor = 1; // black
    this.first_hand = 1;

	this.matrix = [];
	this.undos = [];
	this.player = 1;

	this.peerPlayer = null;
	this.judge = null;
	
	this.tip = null;
	this.gameOver = false;
	
	this.goimgs = [];
};

hotjs.inherit( GoBoard, hotjs.Scene, {
	setSize : function(w, h) {
		GoBoard.supClass.setSize.call(this, w, h);
		var m = Math.min(w, h);
		this.setArea( (w-m)/2, (h-m)/2, m, m );
		
		return this;
	},
    setRow : function( n ) {
        if(n > 0) this.rows = n;
        else this.rows = 15;
    },
    setFirstHand : function( first ) {
        if(first == 1 || first == 2) {
            this.first_hand = first;
        } else {
            this.first_hand = 1;
        }
    },
    exchangeFirstHand : function() {
        this.first_hand = (this.first_hand == 1) ? 2 : 1;
    },
	setGridStyle : function( g ) {
		this.gridStyle = g;
		return this;
	},
	setGoImages : function( imgs ) {
		if( imgs.length < 3 ) {
			console.log( 'go images need at least 3 for black, white and tip.');
		}
		this.goimgs = [];
		for( var i=0; i<imgs.length; i++ ) {
			this.goimgs.push( imgs[i] );
		}
		return this;
	},
	setGoImage : function( img, r ) {		
		this.goimg = img;
		this.goimgrect = [ r[0], r[1], r[2], r[3] ];
		
		return this;
	},
	resetGame : function() {
		// init matrix with 0
		this.matrix = [];
		for( var i=0; i<this.rows; i++ ) {
			var row = [];
			for( var j=0; j<this.rows; j++ ) {
				row.push(0);
			}
			this.matrix.push(row);
		}
		
		// [ x, y, 1/2 ] 
		this.undos = [];
		this.player = this.first_hand;
		
		this.tip = null;
		this.gameOver = false;
		
		if( this.player != this.hostColor ) {
			this.peerPlayer.go( [0,0,0], hotjs.Matrix.toString(this.matrix) );
		}

		return this;
	},
	posToMatrix : function(p) {
		var a = this.getArea();
		var ux = a.w / this.rows, uy = a.h / this.rows;
		var x = Math.floor((p[0] - a.l) / ux);
		var y = Math.floor((p[1] - a.t) / uy);
		return [x, y];
	},
	posFromMatrix : function(p) {
		var a = this.getArea();
		var ux = a.w / this.rows, uy = a.h / this.rows;
		var x = Math.floor(a.l + (p[0]+0.5) * ux);
		var y = Math.floor(a.t + (p[1]+0.5) * uy);
		return [x, y];
	},
	addItem : function() {
		for( var i=0; i<this.rows; i++ ) {
			for( var j=0; j<this.rows; j++ ) {
				if( this.matrix[i][j] == 0 ) {
					this.go( i, j );
					return true;
				}
			}
		}

		return false;
	},
	setHostColor : function(c) {
		var c2 = (c == 1) ? 2 : 1;
		this.peerPlayer.setGoColor(c2);
		return this;
	},
	exchangeColor : function(){
		this.hostColor = (this.hostColor == 1) ? 2 : 1;
		this.setHostColor( this.hostColor );
		return this;
	},
	confirmColor : function(c) {
		this.hostColor = c;
		return this;
	},
	getHostColor : function() {
		return this.hostColor;
	},
	setPeerPlayer : function(p) {
		this.peerPlayer = p;
		
		return this;
	},
	setJudge : function(p) {
		this.judge = p;
		return this;
	},
	showTip : function(b) {
		if(b == undefined) b = (! this.tipOn);
		this.tipOn = b;

		if( this.tipOn ) {
			this.peerPlayer.judge( hotjs.Matrix.toString(this.matrix) );
		}
		
		return this;
	},
	getTipStatus : function(b) {
		return this.tipOn;
	},
	setTip : function( s ) {
		this.tip = s;

		return this;
	},
	onGo : function( func ) {
		this.goCallbacks = [ func ];
		return this;
	},
	go : function(x, y) {
		if( this.matrix[y][x] == 0 ) {
			// put a stone 
			this.matrix[y][x] = this.player;
			
			var current_player = this.player;
			this.goCallbacks.forEach(function(func){
				func( current_player );
			});
			
			// record for undo
			var lastMove = [x, y, this.player];
			this.undos.push( lastMove );

			// change turn to another player 
			if( this.player == 1 ) this.player = 2;
			else this.player = 1;
			
			if( this.judge ) {
				this.judge.judge( hotjs.Matrix.toString(this.matrix) );
			}
			
			if( this.player != this.hostColor ) {
				var self = this;
				window.setTimeout( function() {
					self.peerPlayer.go( lastMove, hotjs.Matrix.toString(self.matrix) );
				}, 100 );
			}
		}
		
		return this;
	},
	getStepCount : function() {
		return this.undos.length;
	},
	canUndo : function() {
		if( this.undos.length < 2 ) return false;
		
		return true;
	},
	undo : function() {
		
		if( this.undos.length >= 2 ) {
			this.gameOver = false;

			var lastMove = this.undos.pop();
			this.matrix[ lastMove[1] ][ lastMove[0] ] = 0;

			lastMove = this.undos.pop();
			this.matrix[ lastMove[1] ][ lastMove[0] ] = 0;
			
			if( this.player != this.hostColor ) {
				this.peerPlayer.go( lastMove, hotjs.Matrix.toString(this.matrix) );
			}
			
			if( this.judge ) {
				this.judge.judge( hotjs.Matrix.toString(this.matrix) );
			}
		
			return true;
		} else {
			return false;
		}
	},
	onClick : function(t){
		var p = this.posFromContainer( [t.x, t.y] );
		var a = this.getArea();
		
		var inArea = ( (p[0]>a.l) && (p[0]<a.r) && (p[1]>a.t) && (p[1]<a.b) );
		if( inArea ) {
			p = this.posToMatrix( p );
			if(! this.gameOver) {
				this.go(p[0], p[1]);
			}
		}
	},
	onTouchEnd : function(t) {
		GoBoard.supClass.onTouchEnd.call(this,t);
		
		var param = { duration:0.2,
				step:function(me,dt){ me.fixPos(); },
				done:function(me){ me.fixPos(); }
			};
		//this.velocity = this.gesture;
		//hotjs.Anim.create( this, 'SlowDown', param ).play();
	},
	draw : function(c) {
		GoBoard.supClass.draw.call(this, c);
		
		if( this.gridStyle ) {
			this.drawGoGrid(c);
		} else {
			this.drawGoCell(c);
		}
		
		this.drawTip(c);

		this.drawGo(c);
		
		this.drawWin(c);
	},
	drawWin : function(c) {
		if(!! this.tip ) {
			if( this.tip.myWinHits.length > 0 ) {
				this.drawWinLine( c, this.tip.myWinHits );
			}
			if( this.tip.peerWinHits.length > 0 ) {
				this.drawWinLine( c, this.tip.peerWinHits );
			}
		}
	},
	drawWinLine : function( c, hits ) {
		var a = this.getArea();
		var ux = a.w / this.rows, uy = a.h / this.rows;
		
		function posToDraw( pos ){
			var x = Math.floor(a.l + pos[0] * ux + ux/2);
			var y = Math.floor(a.t + pos[1] * uy + uy/2);
			return [x,y];
		}

		c.save();
		c.lineWidth = 3;
		c.strokeStyle = 'red';
		for(var i=hits.length-1; i>=0; i--) {
			var hit = hits[i];
			var xy = posToDraw( hit[0] );
			c.beginPath();
			c.moveTo(xy[0], xy[1]);
			for(var j=1; j<hit.length; j++) {
				xy = posToDraw( hit[j] );
				c.lineTo(xy[0], xy[1]);
			}
			c.stroke();
		}		
		c.restore();
	},
	drawTip : function(c) {
		var a = this.getArea();
		var ux = a.w / this.rows, uy = a.h / this.rows;

		if(!! this.tip ) {
			if( this.tipOn ) {
				c.save();
				var bestMove = this.tip.bestMove;
				var hitMax = bestMove[2];

				var hitRating = this.tip.hitRating;
				var img = this.goimgs[2];
				for( var i=0; i<this.rows; i++ ) {
					for( var j=0; j<this.rows; j++ ) {
						var x = Math.floor(a.l + j * ux);
						var y = Math.floor(a.t + i * uy);
						var g = hitRating[i][j];
						if( g > 0 ) {
							c.globalAlpha = (g / hitMax) * 0.8;
							c.drawImage( img, 0, 0, img.width, img.height, x, y, ux, uy);
						}
					}
				}
				c.globalAlpha = 1;
				var x = Math.floor(a.l + bestMove[0] * ux);
				var y = Math.floor(a.t + bestMove[1] * uy);
				c.drawImage( img, 0, 0, img.width, img.height, x, y, ux, uy);
				
				c.restore();
			}

			return this;
		}
	},
	drawGo : function(c) {
		var a = this.getArea();
		var ux = a.w / this.rows, uy = a.h / this.rows;
	
		// draw all go stones on board
		var blackgoimg = this.goimgs[0];
		var whitegoimg = this.goimgs[1];
		for( var i=0; i<this.rows; i++ ) {
			for( var j=0; j<this.rows; j++ ) {
				var x = a.l + j * ux;
				var y = a.t + i * uy;
				var g = this.matrix[i][j];
				if( g > 0 ) {
					var img = (g == 1) ? blackgoimg : whitegoimg;
					c.drawImage( img, 0, 0, img.width, img.height, x, y, ux, uy);
				}
			}
		}
		
		// draw last move mark
		if(this.undos.length > 0) {
			var m = this.undos[ this.undos.length -1 ];
			var x = Math.floor(a.l + m[0] * ux);
			var y = Math.floor(a.t + m[1] * uy);

			c.save();
			c.strokeStyle = 'red';
			c.lineWidth = 1;
			//c.strokeRect( x, y, ux, uy );
			c.globalAlpha = 0.8;
			var img = this.goimgs[3];
			c.drawImage( img, 0, 0, img.width, img.height, x-1, y-1, ux+2, uy+2 );
			c.restore();
		}
		
		return this;
	},
	drawGoGrid : function(c) {
		c.save();
		var a = this.getArea();
		var ux = a.w / this.rows, uy = a.h / this.rows;
		
		c.lineWidth = 0.5;
		c.strokeStyle = this.color;
		c.beginPath();
		for( var i=0; i<this.rows; i++ ) {
			c.moveTo( a.l +(i +0.5) * ux, a.t + 0.5 * uy );
			c.lineTo( a.l +(i +0.5) * ux, a.t + (this.rows-0.5) * uy );
		}
		for( var j=0; j<this.rows; j++ ) {
			c.moveTo( a.l +0.5 * ux, a.t + (j+0.5) * uy );
			c.lineTo( a.l +(this.rows - 0.5) * ux, a.t + (j+0.5) * uy );
		}
		c.stroke();
		
		// draw dot 
		c.fillStyle = this.color;
		var dots = [3, this.rows-4, Math.floor(this.rows/2) ];
		for( var i=0; i<3; i++ ) {
			for( var j=0; j<3; j++ ) {
				var x = a.l + (dots[i] + 0.5) * ux;
				var y = a.t + (dots[j] + 0.5) * uy;
				c.fillRect(x-2, y-2, 4, 4);
			}
		}
		
		c.lineWidth = 1;
		c.strokeRect( a.l + 0.5*ux -2, a.t + 0.5*uy -2, 
				ux * (this.rows-1) +4, uy * (this.rows-1) +4 );
		
		c.restore();
	},
	drawGoCell : function( c ) {
		c.save();
		var a = this.getArea();
		var r = this.rows;
		var ux = a.w / r, uy = a.h / r;
		
		c.lineWidth = 0.5;
		c.strokeStyle = this.color;
		c.beginPath();
		for( var i=0; i<= r; i++ ) {
			c.moveTo( a.l + i * ux, a.t + 0 * uy );
			c.lineTo( a.l + i * ux, a.t + r * uy );
		}
		for( var j=0; j<= r; j++ ) {
			c.moveTo( a.l + 0 * ux, a.t + j * uy );
			c.lineTo( a.l + r * ux, a.t + j * uy );
		}
		c.stroke();
		
		c.lineWidth = 1;
		c.strokeRect( a.l + 0*ux -2, a.t + 0*uy -2, 
				ux * (r) +4, uy * (r) +4 );

		c.restore();
	}
});
	
