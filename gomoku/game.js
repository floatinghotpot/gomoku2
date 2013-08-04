
hotjs = hotjs || {};

var ai_go = ai_go || {};

(function(){

var __FILE__ = ( (hotjs.agentType == 'Safari') || /(iphone|ipad|ipod)/i.test(navigator.userAgent) ) ?
	function() { try { throw new Error(); } catch (e) { return e.sourceURL; } }() :
	hotjs.this_file();

var __DIR__ = function(f) {
	return hotjs.getAbsPath(f, __FILE__);
};

var app_key = 'com.rnjsoft.gomoku';

var gameView;
var board;
var ai_player;
var net_player;
var worker;
var dialog;

function rankLevel( win, total ) {
	if( total == 0 ) return 0;
	
	var rate = win / total;
	var level = Math.round( rate * 10 ) - 5;
	return level;
}

function load_data() {
	var data = {};
	var data_str = localStorage.getItem( app_key );
	if( data_str ) {
		data = JSON.parse( data_str );
	}
	if(! data.my) {
		data.my = {
				name : 'player',
				gold : 0,
				total : 0,
				win : 0
			};
	}
	if(! data.ais) {
		data.ais = {
			peer1 : { level: 1, think_time: 500, attack_factor: 1.1, gold: 99, total: 10, win: 5, per: 10 },	
			peer2 : { level: 2, think_time: 300, attack_factor: 1.2, gold: 499, total: 100, win: 60, per: 20 },	
			peer3 : { level: 3, think_time: 10, attack_factor: 1.5, gold: 999, total: 200, win: 140, per: 30 },	
			peer4 : { level: 4, think_time: 500, attack_factor: 0.9, gold: 4999, total: 500, win: 400, per: 40 },	
			peer5 : { level: 5, think_time: 1500, attack_factor: 1.2, gold: 9999, total: 1000, win: 920, per: 50 }	
		};
	}
	if(! data.opt) {
		data.opt = {
				level : 2,
				size : 15,
				mute : false,
				info : true
			};
	}
	if( data.opt.level < 1 || data.opt.level > 5 ) {
		data.opt.level = 2;
	}
	return data;
}

var app_data = load_data();

function save_data() {
	localStorage.setItem( app_key, JSON.stringify(app_data) );
}

function restartGame(){
	if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
	
	board.exchangeColor();
	updateDataShow();

	board.resetGame();
}

function worker_onmessage(evt) {
	var msg = evt.data;
	
	switch(msg.api) {
	case 'confirmColor':
		var c = (msg.color == 2) ? 1 : 2;
		board.confirmColor( c );
		updateDataShow( c );
		break;
	case 'judge':
		var s = msg.solution;
		board.setTip( s );
		
		var peer = app_data.ais[ 'peer' + app_data.opt.level ];
		
		if( s.myWinHits.length > 0 ) {
			//console.log( 'Peer win!' );
			board.gameOver = true;

			window.setTimeout(function() {
				dialog = hotjs.domUI.popupDialog( 
						hotjs.i18n.get('youlost'), 
						"<img src='"+ __DIR__('img/peer' + app_data.opt.level + '-128.png') + "'><p>" 
						+ hotjs.i18n.get('youlost10gold').replace('10', peer.per) + '</p>',
						{
							'playagain':function(){
								restartGame();
								return true;
							}
						},
						{'top':'5px'} );
				
				app_data.my.gold -= peer.per;
				app_data.my.total ++;

				peer.total ++;
				peer.win ++;
				peer.gold += peer.per;
				save_data();
				
				updateDataShow();
			}, 1500);
		}
		
		if ( s.peerWinHits.length > 0 ) {
			//console.log( 'You win! ' );
			board.gameOver = true;

			window.setTimeout( function(){
				dialog = hotjs.domUI.popupDialog( 
						hotjs.i18n.get('youwin'), 
						"<img src='"+ __DIR__('img/win.png') + "'><p>" 
						+ hotjs.i18n.get('youwin10gold').replace('10',peer.per) + '</p>',
						{
							'playagain':function(){
								restartGame();
								return true;
							}
						},
						{'top':'5px'} );
				app_data.my.gold += peer.per;
				app_data.my.total ++;
				app_data.my.win ++;

				peer.total ++;
				peer.gold -= peer.per;
				save_data();
				
				updateDataShow();
			}, 1500);
		}

		if( board.gameOver ) {
			resources.playAudio( __DIR__('audio/magic.mp3') );
		}
		break;
	case 'go':
		if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
		
		if( board.getTipStatus() ) {
			toggleTip( false );
		}
		
		var s = msg.solution;
		var bestMove = s.bestMove;

		if( ! board.gameOver ) {
			var char = app_data.ais[ 'peer' + app_data.opt.level ];
			if( msg.used_time < char.think_time ) {
				window.setTimeout( function(){
					board.go( bestMove[0], bestMove[1] );
				}, (char.think_time - msg.used_time) );				
			} else {
				board.go( bestMove[0], bestMove[1] );
			}
		}
		break;
	case 'undo':
		var s = msg.solution;
		board.setTip( s );
		break;
	}
};

var AIPlayer = function(){
	hotjs.base(this);
	this.mycolor = 2;
	this.char_style = undefined;
};

hotjs.inherit(AIPlayer, hotjs.Class, {
	init : function() {
		//try {
			// only through network, if local file, need embedded into html
			//worker = new Worker( __DIR__('ai_go.js') );
			//worker.onmessage = worker_onmessage;
		//} catch(err) {
			// web worker is not supported by some browser, like Android 4.0.3 in HTC 328D 
			// we just simulate and run the logic in same thread
			hotjs.require( __DIR__('ai_go.js') );

			worker = {};
			worker.postMessage = function(data){
				ai_go.onmessage({ data: data });
			};
			worker.onmessage = worker_onmessage;
			
			ai_go.postMessage = function(data){
				worker.onmessage({ data: data});
			};
		//}
		return this;
	},
	setGoColor : function(c) {
		worker.postMessage({
			api: 'setColor',
			color: c
		});
	},
	setCharStyle : function( cs ) {
		this.char_style = cs ;
		worker.postMessage({
			api: 'setCharStyle',
			char_style: cs
		});
	},
	judge : function( mtx_str) {
		worker.postMessage({
			api: 'judge',
			matrix_str: mtx_str
		});
	},
	go : function( move, mtx_str) {
		if( this.char_style == undefined ) {
			peer = app_data.ais[ 'peer' + app_data.opt.level ];
			this.setCharStyle( {
				level: peer.level,
				think_time: peer.think_time,
				attack_factor: peer.attack_factor
			});
		}
		worker.postMessage({
			api: 'go',
			move: {
				x: move[0],
				y: move[1],
				color:move[2]
			},
			matrix_str: mtx_str
		});
	},
	undo : function( move, mtx_str) {
		worker.postMessage({
			api: 'undo',
			move: {
				x: move[0],
				y: move[1],
				color:move[2]
			},
			matrix_str: mtx_str
		});
	}
});


function updateDataShow() {
	var me = $('img#my-gocolor');
	var peer = $('img#peer-gocolor');
	if( board.getHostColor() == 1 ) {
		me.attr('src', __DIR__('img/blackgo.png') );
		peer.attr('src', __DIR__('img/whitego.png') );
	} else {
		me.attr('src', __DIR__('img/whitego.png') );
		peer.attr('src', __DIR__('img/blackgo.png') );
	}
	
	var my_winrate = ((app_data.my.total > 0) ? (app_data.my.win / app_data.my.total) : 0);
	$('#my-gold').text( app_data.my.gold );
	$('#my-win').text( app_data.my.win );
	$('#my-rate').text( Math.round(my_winrate * 100) + '%' );
	$('#my-rank').text( hotjs.i18n.get( 'level' + rankLevel( app_data.my.win, app_data.my.total ) ) );

	$('#peer-img')[0].src = __DIR__('img/peer' + app_data.opt.level + '-64.png');
	$('#peer-name').text( hotjs.i18n.get( 'peer' + app_data.opt.level ) );
	
	var peer = app_data.ais[ 'peer' + app_data.opt.level ];
	var peer_winrate = ((peer.total > 0) ? (peer.win / peer.total) : 0);
	$('#peer-gold').text( peer.gold );
	$('#peer-win').text( peer.win );
	$('#peer-rate').text( Math.round(peer_winrate * 100) + '%' );
	$('#peer-rank').text( hotjs.i18n.get( 'level' + rankLevel( peer.win, peer.total ) ) );
}

function muteAudio( mute ){
	if( mute ) {
		resources.muteAudio(true);
		$('img#icon-audio').attr('src', __DIR__('img/audiomute.png') );
	} else {
		resources.muteAudio(false);
		$('img#icon-audio').attr('src', __DIR__('img/audio.png') );
	}
};

function toggleTip( b ) {
	if( b ) {
		board.showTip( true );

		if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('tipon'), 
				'<p>' + hotjs.i18n.get('tipcost1gold') + '</p>',
				{},
				{'top':'5px'} );
		
		app_data.my.gold --;
		save_data();
		
		updateDataShow();

	} else {
		board.showTip( false );
		if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
	}
	
	if( board.getTipStatus() ) {
		$('.icon-tip').attr('src', __DIR__("img/tipon.png") );
	} else {
		$('.icon-tip').attr('src', __DIR__("img/tipoff.png") );
	}
}

function init_events() {
	$(window).resize( game_resize );
	
	$('button#btn-quick').on('click', restartGame );
	$('img.icon-start').on('click', restartGame );
	
	$('img.icon-undo').on('click', function(){
		if( ! board.canUndo() ) {
			if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('notstarted'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
					+ hotjs.i18n.get('notstartedcannotdo') + '</p>' );
		} else if( board.gameOver ) {
			if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('gameover'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
					+ hotjs.i18n.get('gameovercannotdo') + '</p>' );
		} else if( board.canUndo() ) {
			if( app_data.my.gold >= 3 ) {
				board.undo();
				if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
				dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('undook'), 
					"<p>" + hotjs.i18n.get('undocost3gold') + '</p>', 
					{}, {'top':'5px'} );
				
				app_data.my.gold -= 3;
				save_data();
				updateDataShow();
			} else {
				if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
				dialog = hotjs.domUI.popupDialog( 
						hotjs.i18n.get('nogold'), 
						"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
						+ hotjs.i18n.get('nogoldcannotdo') + '</p>', {
							'buy':function(){
								return true;
							},
							'watchad':function(){
								return true;
							}
						} );
			}
		}
	});

	$('img.icon-tip').on('click', function(){
		if( ! board.canUndo() ) {
			if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('notstarted'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
					+ hotjs.i18n.get('notstartedcannotdo') + '</p>' );
		} else if( board.gameOver ) {
			if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('gameover'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
					+ hotjs.i18n.get('gameovercannotdo') + '</p>' );
		} else if ( app_data.my.gold >= 1 ) {
			toggleTip(! board.getTipStatus() );
		} else {
			if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('nogold'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
					+ hotjs.i18n.get('nogoldcannotdo') + '</p>', {
						'buy':function(){
							return true;
						},
						'watchad':function(){
							return true;
						}
					} );
		}
	});
	
	$('img.icon-opt').on('click', function(){
		hotjs.domUI.toggle( $('div#pageopt')[0] );
	});
	
	$('img.icon-buy').on('click', function(){
		hotjs.domUI.toggle( $('div#pagebuy')[0] );
	});
	
	$('img.icon-info').on('click', function(){
		hotjs.domUI.toggle( $('div#pageinfo')[0] );
	});
	
	function genBriefInfo( char_id ) {
		var peer = app_data.ais[ 'peer' + char_id ];
		var peer_winrate = ((peer.total > 0) ? (peer.win / peer.total) : 0);
		return "<img src='" + __DIR__('img/peer' + char_id + '-128.png') + "'><p>" 
			+ hotjs.i18n.get('peer' + char_id + 'desc') + '</p><p>'
			+ hotjs.i18n.get('win') + peer.win + '/' + peer.total + ' ( ' 
			+ hotjs.i18n.get('winrate') + Math.round(peer_winrate * 100) + '% )</p><p>'
			+ hotjs.i18n.get('winlost10gold').replace('10', peer.per) + '</p>';
	}

	$('img#peer-img').on('click', function(){
		var char_id = app_data.opt.level;
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get( 'peer' + char_id ), 
				genBriefInfo( char_id )
				);
	});
	
	$('img#my-img').on('click', function(){
		var my_winrate = ((app_data.my.total > 0) ? (app_data.my.win / app_data.my.total) : 0);
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get( 'yourinfo' ), 
				'<p>' + hotjs.i18n.get('win') + app_data.my.win + '/' + app_data.my.total + ' ( ' 
				+ hotjs.i18n.get('winrate') + Math.round(my_winrate * 100) + '% )</p>'
				);
	});

	$('img.btn-char').on('click', function(){
		var char_id = $(this).attr('v');
		var peer = app_data.ais[ 'peer' + char_id ];
		
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('peer' + char_id),
				genBriefInfo( char_id ) + hotjs.i18n.get('confirmfight'),
 				{
					'ok' : function() {
						app_data.opt.level = char_id;
						save_data();
						
						peer = app_data.ais[ 'peer' + app_data.opt.level ];
						ai_player.setCharStyle( {
							level: peer.level,
							think_time: peer.think_time,
							attack_factor: peer.attack_factor
						});

						updateDataShow();
						
						return true;
					},
					'cancel' : function() {
						return true;
					}
				});
		
	});

	$('button.btn-size').on('click', function(){
		app_data.opt.size = $(this).attr('v');
		save_data();
		
		board.resetGame( app_data.opt.size );
	});
	
	$('img#icon-audio').on('click', function(){
		console.log( 'img#icon-audio' );
		app_data.opt.mute = ! app_data.opt.mute;
		save_data();
		
		muteAudio( app_data.opt.mute );
	});

	$('img#icon-reset').on('click', function(){
		console.log( 'img#icon-reset' );		
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('resetdata'), 
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('resetdatalosthistory') + '</p>',
 				{
					'ok' : function() {

//						app_data = {};
//						save_data();
//						app_data = load_data();
						
						app_data.my.total = 0;
						app_data.my.win = 0;
						app_data.my.gold -= 100;
						save_data();
						
						updateDataShow();
						
						return true;
					},
					'cancel' : function() {
						return true;
					}
				});
		
		
	});
}

var res = [
 __DIR__('../lib/color-buttons.css'),
 __DIR__('game.css'),
 __DIR__('lang/en.lang.js'),
 __DIR__('lang/zh.lang.js'),
 __DIR__('lang/ja.lang.js'), 
 __DIR__('goboard.js'),
 __DIR__('net_go.js'),
 __DIR__('img/yard.jpg'),
 __DIR__('img/blackgo.png'),
 __DIR__('img/whitego.png'),
 __DIR__('img/greengo.png'),
 __DIR__('img/user1.png'),
 __DIR__('img/user2.png'),
 __DIR__('img/restart.png'),
 __DIR__('img/undo.png'),
 __DIR__('img/tipoff.png'),
 __DIR__('img/tipon.png'),
 __DIR__('img/options.png'),
 __DIR__('img/info.png'),
 __DIR__('img/peer1-64.png'),
 __DIR__('img/peer2-64.png'),
 __DIR__('img/peer3-64.png'),
 __DIR__('img/peer4-64.png'),
 __DIR__('img/peer5-64.png'),
 __DIR__('img/peer1-128.png'),
 __DIR__('img/peer2-128.png'),
 __DIR__('img/peer3-128.png'),
 __DIR__('img/peer4-128.png'),
 __DIR__('img/peer5-128.png'),
 __DIR__('img/win.png'),
 __DIR__('img/lost.png'),
 __DIR__('img/shrug.png'),
 __DIR__('img/gold.png'),
 __DIR__('img/coinbag.png'),
 __DIR__('img/coinbox.png'),
 __DIR__('img/reset.png'),
 __DIR__('img/audio.png'),
 __DIR__('img/audiomute.png')
];

function game_resize(w, h) {
	if( /(ipad)/i.test(navigator.userAgent) ) {
	    $('table.userinfo').css({'display':'block'});
		$('img.icon').css({
			'width': 64 + 'px',
			'height': 64 + 'px'
		});
	} else {
	    $('table.userinfo').css({'display':'none'});
		$('img.icon').css({
			'width': 32 + 'px',
			'height': 32 + 'px'
		});
	}
	
	var w = window.innerWidth, h = window.innerHeight;
	var mh = $("div#bottom-menu").height();
	h -= mh;

	$('div.full').css({width:w+'px', height:h+'px'});
	
	if(!! gameView) gameView.setSize(w,h);
	if(!! board) board.setSize(w,h);

	var pg = $('div#pageopt');
	var sw = pg.width(), sh = pg.height();
	pg.css({'top': ((h-sh)/2 - 10) +'px', 'left': ((w-sw)/2 -10) + 'px'});
	
	pg = $('div#pagebuy');
	sw = pg.width(), sh = pg.height();
	pg.css({'top': ((h-sh)/2 - 10) +'px', 'left': ((w-sw)/2 -10) + 'px'});

	pg = $('div#pageinfo');
	sw = pg.width(), sh = pg.height();
	pg.css({'top': ((h-sh)/2 - 10) +'px', 'left': ((w-sw)/2 -10) + 'px'});

	if( w>h ) {
		$('div#controlright').css({ // right
			'display':'inline-block',
			'width': '',
			'height':'',
			'left':'',
			'right':'5px',
			'top':'',
			'bottom': (mh+2) + 'px'
		});
		$('div#controlbottom').css({'display':'none'});
		
		var m = Math.min(w, h) - 10;
		board.setArea( (w-m)/2, (h-m)/2, m, m );
	} else {
		$('div#controlright').css({'display':'none'});
		$('div#controlbottom').css({ // bottom
			'display':'inline-block',
			'width':w+'px',
			'height':'',
			'left':'2px',
			'right':'2px',
			'top':'',
			'bottom': (mh+2) + 'px'
		});
		
		var h_info = Math.max($('div#user1').height(), h*220/960);
		var h_ctrl = $('div#controlbottom').height();
		var h_in = h - h_info - h_ctrl;
		var m = Math.min(w, h_in) - 20;
		board.setArea( (w-m)/2, h_info + (h_in - m)/2, m, m );
	}
}

function init_UI() {
	if( /(iphone|ipod)/i.test(navigator.userAgent) ) {
	    $(document.body).css({'font-size':'14px'});
	}
	
	var pagemain = document.getElementById('pagemain');
	pagemain.innerHTML = 
"<div id='gameView' class='full' style='display:block;'></div>\
<div id='user1' class='userinfo round'>\
<table class='m'>\
<tr>\
<td><img id='my-img' class='icon48 clickable' src='" + __DIR__('img/user2.png') + "'><br/><span class='I18N' i18n='player' id='my-name'>Player</span></td>\
<td><img class='icon32' src='" + __DIR__('img/gold.png') + "'><br/><span id='my-gold'>1800</span></td>\
<td><img width=32 id='my-gocolor' src='" + __DIR__('img/blackgo.png') + "'/></td>\
</tr>\
</table>\
<table class='userinfo m'>\
<tr><td align='left'><span class='I18N' i18n='win'>Win:</span></td><td><span id='my-win'>0</span> ( <span id='my-rate'>64%</span>)</td></tr>\
<tr><td align='left'><span class='I18N' i18n='rank'>Rank:</span></td><td><span id='my-rank'>6</span></td></tr>\
</table>\
</div>\
<div id='user2' class='userinfo round'>\
<table class='m'>\
<tr>\
<td><img width=32 id='peer-gocolor' src='" + __DIR__('img/whitego.png') + "'/></td>\
<td><img class='icon32' src='" + __DIR__('img/gold.png') + "'><br/><span id='peer-gold'>1500</span></td>\
<td><img id='peer-img' class='icon48 clickable' src='" + __DIR__('img/user1.png') + "'><br/><span class='I18N' i18n='peer' id='peer-name'>Peer</span></td>\
</tr>\
</table>\
<table class='userinfo m'>\
<tr><td align='left'><span class='I18N' i18n='win'>Win:</span></td><td><span id='peer-win'>0</span> (<span id='peer-rate'>54%</span>)</td></tr>\
<tr><td align='left'><span class='I18N' i18n='rank'>Rank:</span></td><td><span id='peer-rank'>5</span></td></tr>\
</table>\
</div>\
<div id='controlright' class='control'>\
<table class='controlright'>\
<tr>\
<tr><td><img class='icon clickable icon-tip' src='" + __DIR__('img/tipoff.png') + "'/><br><span class='I18N icon' i18n='tips'>Tips</span></td>\
<td><img class='icon clickable icon-undo' src='" + __DIR__('img/undo.png') + "'/><br><span class='I18N icon' i18n='undo'>Undo</span></td></tr>\
<tr><td><img class='icon clickable icon-start' src='" + __DIR__('img/restart.png') + "'/><br><span class='I18N icon' i18n='new'>New</span></td>\
<td><img class='icon clickable icon-opt' src='" + __DIR__('img/options.png') + "'/><br><span class='I18N icon' i18n='options'>Options</span></td></tr>\
<tr><td><img class='icon clickable icon-buy' src='" + __DIR__('img/gold.png') + "'/><br><span class='I18N icon' i18n='buy'>Buy</span></td>\
<td><img class='icon clickable icon-info' src='" + __DIR__('img/info.png') + "'/><br><span class='I18N icon' i18n='info'>Info</span></td></tr>\
</table></div>\
<div id='controlbottom' class='control'>\
<table>\
<tr>\
<td><img class='icon clickable icon-tip' src='" + __DIR__('img/tipoff.png') + "'/><br><span class='I18N icon' i18n='tips'>Tips</span></td>\
<td><img class='icon clickable icon-undo' src='" + __DIR__('img/undo.png') + "'/><br><span class='I18N icon' i18n='undo'>Undo</span></td>\
<td><img class='icon clickable icon-start' src='" + __DIR__('img/restart.png') + "'/><br><span class='I18N icon' i18n='new'>New</span></td>\
<td><img class='icon clickable icon-opt' src='" + __DIR__('img/options.png') + "'/><br><span class='I18N icon' i18n='options'>Options</span></td>\
<td><img class='icon clickable icon-buy' src='" + __DIR__('img/gold.png') + "'/><br><span class='I18N icon' i18n='buy'>Buy</span></td>\
<td><img class='icon clickable icon-info' src='" + __DIR__('img/info.png') + "'/><br><span class='I18N icon' i18n='info'>Info</span></td>\
</table></div>\
<div id='pageopt' class='dialog round' popup='true' style='display:none;'>\
<table class='m'>\
<tr>\
<td></td><td colspan=3><span class='I18N' i18n='options'>Options</span></td><td class='r'><img class='icon-opt' src='" + __DIR__('img/x.png') + "'></td>\
</tr>\
<tr><td colspan=5 style='text-align:left'><span class='I18N' i18n='selectpeer'>Select</span></td></tr>\
<tr>\
<td><img class='btn-char icon48 clickable' v='1' src='" + __DIR__('img/peer1-64.png') +"'/><br/><span class='I18N' i18n='peer1'>Kid</span></td>\
<td><img class='btn-char icon48 clickable' v='2' src='" + __DIR__('img/peer2-64.png') +"'/><br/><span class='I18N' i18n='peer2'>Girl</span></td>\
<td><img class='btn-char icon48 clickable' v='3' src='" + __DIR__('img/peer3-64.png') +"'/><br/><span class='I18N' i18n='peer3'>Boy</span></td>\
<td><img class='btn-char icon48 clickable' v='4' src='" + __DIR__('img/peer4-64.png') +"'/><br/><span class='I18N' i18n='peer4'>Uncle</span></td>\
<td><img class='btn-char icon48 clickable' v='5' src='" + __DIR__('img/peer5-64.png') +"'/><br/><span class='I18N' i18n='peer5'>Grandpa</span></td>\
</tr>\
<tr><td colspan=4 style='text-align:left'>&nbsp;</td></tr>\
<tr><td colspan=4 style='text-align:left'><span  class='I18N' i18n='boardsize'>Board Size</span></td></tr>\
<tr>\
<td><button class='btn-size set button rosy' v='11'>11</button></td>\
<td><button class='btn-size set button yellow' v='13'>13</button></td>\
<td><button class='btn-size set button green' v='15'>15</button></td>\
<td><button class='btn-size set button cyan' v='17'>17</button></td>\
<td><button class='btn-size set button blue' v='19'>19</button></td>\
</tr>\
<tr><td colspan=4 style='text-align:left'>&nbsp;</td></tr>\
<tr>\
<td style='text-align:right'><span  class='I18N' i18n='audio'>Audio</span></td>\
<td><img id='icon-audio' class='icon clickable' src='" + __DIR__('img/audio.png') + "' width='32'></td>\
<td colspan=2 style='text-align:right'><span  class='I18N' i18n='resetdata'>Reset Data</span></td>\
<td><img id='icon-reset' class='icon clickable' src='" + __DIR__('img/reset.png') + "' width='32'></td>\
</tr>\
</table>\
</div>\
<div id='pagebuy' class='dialog round' popup='true' style='display:none;'>\
<table class='m'>\
<tr><td></td><td colspan=2><span class='I18N' i18n='buyhappy'>Buy Happy</span></td><td class='r'><img class='icon-buy' src='" + __DIR__('img/x.png') + "'></td></tr>\
<tr><td><img class='btn-buy icon32' src='" + __DIR__('img/gold.png') +"'/></td><td class='l'><span class='I18N' i18n='pkg0'>5 golds</span></td><td class='r'><span class='I18N' i18n='pkg0info'>FREE everyday</span></td><td><button class='I18N' i18n='pkg0price'>Get It</button></td><td></td></tr>\
<tr><td><img class='btn-buy icon48' src='" + __DIR__('img/coinbag.png') +"'/></td><td class='l'><span class='I18N' i18n='pkg1'>500 golds</span></td><td class='r'><span class='I18N' i18n='pkg1info'>&nbsp;</span></td><td><button class='I18N' i18n='pkg1price'>$ 1</button></td><td></td></tr>\
<tr><td><img class='btn-buy icon48' src='" + __DIR__('img/coinbag.png') +"'/></td><td class='l'><span class='I18N' i18n='pkg2'>2000 golds</span></td><td class='r'><span class='I18N' i18n='pkg2info'>50% OFF</span></td><td><button class='I18N' i18n='pkg2price'>$ 2</button></td><td></td></tr>\
<tr><td><img class='btn-buy icon48' src='" + __DIR__('img/coinbox.png') +"'/></td><td class='l'><span class='I18N' i18n='pkg3'>10000 golds</span></td><td class='r'><span class='I18N' i18n='pkg3info'>70% OFF</span></td><td><button class='I18N' i18n='pkg3price'>$ 4</button></td><td></td></tr>\
</table>\
</div>\
<div id='pageinfo' class='dialog round' popup='true' style='display:none;'>\
<table class='m'>\
<tr><td></td><td colspan=2><span class='I18N' i18n='gamerule'>Game Rule</span></td><td class='r'><img class='icon-info' src='" + __DIR__('img/x.png') + "'></td></tr>\
<tr><td></td><td class='l'>\
<ol><li><span class='I18N' i18n='blackfirst'>Black goes first.</span></li>\
<li><span class='I18N' i18n='connect5win'>The one who connect 5 in a row wins.</span></li>\
<li><span class='I18N' i18n='tipcost1gold'>Tip costs 1 gold.</span></li>\
<li><span class='I18N' i18n='undocost3gold'>Undo costs 3 gold.</span></li></ol></td></tr>\
<tr><td colspan=4 style='text-align:left'><span  class='I18N' i18n='doyouknow'>Do you know?</span></td></tr>\
<tr><td></td><td class='l'><ul><li><span class='I18N' i18n='watchad'>Watching Ad may get surprise.</span></li>\
<li><span class='I18N' i18n='canzoom'>You can zoom the grid with fingers.</span></li></ul></td></tr>\
<tr><td></td><td class='m'><span class='I18N' i18n='presented'>Product of RnJSoft</span></td></tr>\
<tr><td></td><td class='m'><span class='I18N' i18n='twitter'>Twitter: @rnjsoft</span></td></tr>\
</table>\
</div>";
}

//<tr>\
//<td colspan=2><button class='I18N' i18n='welcome'>Welcome</button></td>\
//<td></td>\
//<td colspan=2><button class='I18N' i18n='about'>About</button></td>\
//</tr>\

var app = new hotjs.App();

function game_main() {

	init_UI();
	init_events();
	
	var w = window.innerWidth, h = window.innerHeight;
	h -= $("div#bottom-menu").height();
	
	var v = document.getElementById('gameView');
	v.style.width = w;
	v.style.height = h;
	
	gameView = (new hotjs.View())
		.setContainer('gameView')
		.setSize(w,h)
		.setBgImage( false, resources.get(__DIR__('img/yard.jpg')) )
		.setMaxFps(25)
		.showFPS(false);

	ai_player = new AIPlayer().init();
	
	function playMoveSound( player ){
		if( player == 1 ) {
			resources.playAudio( __DIR__('audio/move2.mp3') );
		} else {
			resources.playAudio( __DIR__('audio/move.mp3') );
		}
	}
	
	board = (new GoBoard( app_data.opt.size ))
		.setSize(w, h).showGrid(false)
		.setColor("white").setGridStyle(false)
		//.setAreaImage( true, resources.get(__DIR__('img/wood.jpg')) ) // transparent grid
		.setGoImages( [ 
		               resources.get(__DIR__('img/blackgo.png')),
		               resources.get(__DIR__('img/whitego.png')),
		               resources.get(__DIR__('img/greengo.png'))
		                ])
		.showImg(true)
		.setDraggable(true).setMoveable(true).setZoomable(true)
		.setPeerPlayer( ai_player )
		.setJudge( ai_player )
		.onGo( playMoveSound )
		.addTo( gameView )
		.resetGame();
	
	game_resize();
	updateDataShow();
	muteAudio( app_data.opt.mute );
	hotjs.i18n.translate();
	resources.playAudio( __DIR__('audio/hello.mp3') );
	
	hotjs.domUI.showSplash( false );

	app.addNode(gameView).start();
	
	if( ! app_data.opt.get_gift ) {
		dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get('welcome'), 
			"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
			+ hotjs.i18n.get('welcometogomoku') + '</p>',
			{
				'getgift' : function() {
					app_data.my.gold += 100;
					app_data.opt.get_gift = 1;
					save_data();
					
					updateDataShow();
					
					return true;
				}
			});
		
	}
}

function game_init() {
	// show logo
	hotjs.domUI.showSplash( true, 
			"<h1>GOMOKU<br/>KINGDOM</h1><img class='logo' src='" + __DIR__('img/icon.png') + "'/><h3>&copy; RNJSOFT</h3>",
			{'background':'white'} );
	
	var tLoadingStart = Date.now();
	resources.load( res, { ready: 
		function(){
			var tLoadingDone = Date.now();
			var tUsed = tLoadingDone - tLoadingStart;
			if( tUsed > 3000 ) {
				game_main();
			} else {
				window.setTimeout( game_main, 3000 - tUsed );
			} 
		} 
	});
}

function game_exit() {
	app.stop();
	
	var pagemain = document.getElementById('pagemain');
	pagemain.innerHTML = "";
}

resources.regApp( {
	addRes : function() {},
	getRes : function() { return res; },
	init : game_init,
	exit : game_exit
});

})();

