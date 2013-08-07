
hotjs = hotjs || {};

var ai_go = ai_go || {};

(function(){

var __FILE__ = ( (hotjs.agentType == 'Safari') || /(iphone|ipad|ipod)/i.test(navigator.userAgent) ) ?
	function() { try { throw new Error(); } catch (e) { return e.sourceURL; } }() :
	hotjs.this_file();

var __DIR__ = function(f) {
	return hotjs.getAbsPath(f, __FILE__);
};

var app_key = 'com.rnjsoft.GomokuMist';

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
	
	$('#my-gold').text( app_data.my.gold );

	$('#peer-img')[0].src = __DIR__('img/peer' + app_data.opt.level + '-64.png');
	$('#peer-name').text( hotjs.i18n.get( 'peer' + app_data.opt.level ) );
	
	var peer = app_data.ais[ 'peer' + app_data.opt.level ];
	$('#peer-gold').text( peer.gold );
}

function toggleAudio(){
	if( app_data.opt.mute ) {
		resources.muteAudio(true);
		$('img#icon-audio').attr('src', __DIR__('img/audiomute.png') );
	} else {
		resources.muteAudio(false);
		$('img#icon-audio').attr('src', __DIR__('img/audio.png') );
	}
};

function toggleAd() {
	if(window.plugins && window.plugins.AdMob) {
		var am = window.plugins.AdMob;
		if( app_data.opt.ad ) {
			am.showAd( true );
		} else {
			am.showAd( false );
		}
	}
	
	if( app_data.opt.ad ) {
		$('img#icon-ad').attr('src', __DIR__('img/ad.png') );
	} else {
		$('img#icon-ad').attr('src', __DIR__('img/adoff.png') );
	}		
}

function toggleMusic() {
	if( app_data.opt.music ) {
		$('img#icon-music').attr('src', __DIR__('img/music.png') );
	} else {
		$('img#icon-music').attr('src', __DIR__('img/musicoff.png') );
	}
}

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

function buy( pkgid, payment_method ) {
	if( payment_method == 'paypal' ) {
		payWithPaypal( pkgid );
	} else if ( payment_method === 'iap' ) {
		payWithIAP( pkgid );
	} else {
		// TODO: suppport more, like AliPay, TenPay, etc.
	}
}

function payWithPaypal( pkgid ) {
	if(! window.plugins) return;
	if(! window.plugins.PayPalMPL) return;	
	
	var ppm = window.plugins.PayPalMPL;
    
	var n = Number( hotjs.i18n.get( pkgid ) );
	var name = n + hotjs.i18n.get( 'golds' );
	var price = hotjs.i18n.get( pkgid + '_price' );
	var currency = hotjs.i18n.get( 'currency' );
	
	ppm.setPaymentInfo({
       'paymentCurrency' : currency,
       'subTotal' : price,
       'recipient' : 'rnjsoft.mobile@gmail.com',
       'description' : 'game coins (' + name + ')',
       'merchantName' : 'rnjsoft'
       }, 
       function() {
    	   ppm.pay({}, function() {
    		   app_data.my.gold += n;
    		   save_data();
    		   updateDataShow();
    		   dialog = hotjs.domUI.popupDialog( 
   					hotjs.i18n.get('paydone'), 
   					"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
   					+ hotjs.i18n.get('paydone_happy') + '</p>' );
           }, function() {
    		   dialog = hotjs.domUI.popupDialog( 
      					hotjs.i18n.get('payfailed'), 
      					"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
      					+ hotjs.i18n.get('payfailed_retrylater') + '</p>' );
           });
       }, function() {
		   dialog = hotjs.domUI.popupDialog( 
 					hotjs.i18n.get('payfailed'), 
 					"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
 					+ hotjs.i18n.get('payfailed_retrylater') + '</p>' );
       });
}

function payWithIAP( pkgid ) {
	if(! window.plugins) return;
	if(! window.plugins.InAppPurchaseManager) return;	
	
	var iap = window.plugins.InAppPurchaseManager;
	
	var productId = hotjs.i18n.get( pkgid + '_id' );
	iap.makePurchase( productId, 1, function(){
	   app_data.my.gold += n;
	   save_data();
	   updateDataShow();
	   dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('paydone'), 
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
				+ hotjs.i18n.get('paydone_happy') + '</p>' );
	}, function() {
	   dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('payfailed'), 
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
				+ hotjs.i18n.get('payfailed_retrylater') + '</p>' );
	});
}

function popupNeedGoldDlg() {
	if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
	dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get('nogold'), 
			"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
			+ hotjs.i18n.get('nogoldcannotdo') + '</p>', {
				'buy':function(){
					hotjs.domUI.toggle( $('div#pagebuy')[0] );
					return true;
				},
				'watchad':function(){
					app_data.opt.ad = true;
					toggleAd();
					return true;
				}
			} );	
}

function showWelcomeDlg() {
	dialog = hotjs.domUI.popupDialog( 
		hotjs.i18n.get('welcome'),
		"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('welcometogomoku') + '</p>', 
		{
			'getgift' : function() {
				if (app_data.opt.get_gift) {
					hotjs.domUI.popupDialog(hotjs.i18n.get('welcome'), hotjs.i18n.get('gift_picked'));
				} else {
					app_data.my.gold += 100;
					app_data.opt.get_gift = 1;
					save_data();
					updateDataShow();
				}
				return true;
			}
		});
}

function showPlayerInfoDlg() {
	var my_winrate = ((app_data.my.total > 0) ? (app_data.my.win / app_data.my.total) : 0);
	dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get( 'yourinfo' ), 
			"<table>" + 
			"<tr><td>" + hotjs.i18n.get('win') + "</td><td class='l'>" + + app_data.my.win + '/' + app_data.my.total + "</td>" +
			"<tr><td>" + hotjs.i18n.get('winrate') + "</td><td class='l'>" + Math.round(my_winrate * 100) + "% </td>" + 
			"<tr><td>" + hotjs.i18n.get('name') + "</td><td class='l'><input id='myname' valule='"+ app_data.my.name + "'/></td>" + 
			"<tr><td>" + hotjs.i18n.get('email') + "</td><td class='l'><input id='myemail' valule='"+ app_data.my.email + "'/></td>" + 
			"<tr><td>" + hotjs.i18n.get('twitter') + "</td><td class='l'><input id='mytwitter' valule='"+ app_data.my.twitter + "'/></td>" + 
			"<tr><td>" + hotjs.i18n.get('facebook') + "</td><td class='l'><input id='myfacebook' valule='"+ app_data.my.facebook + "'/></td>" + 
			"<tr><td>" + hotjs.i18n.get('device') + "</td><td class='l'>" + navigator.userAgent + "</td>" + 
			"</table>", {
				'save' : function() {
					app_data.my.name = $('input#myname').val();
					app_data.my.email = $('input#myemail').val();
					app_data.my.twitter = $('input#mytwitter').val();
					app_data.my.facebook = $('input#myfacebook').val();
					save_data();
					return true;
				},
				'cancel' : function() {
					return true;
				}
			} );
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
				popupNeedGoldDlg();
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
			popupNeedGoldDlg();
		}
	});
	
	$('img.icon-opt').on('click', function(){
		hotjs.domUI.toggle( $('div#pageopt')[0] );
	});
	
	$('img.icon-buy').on('click', function(){
		hotjs.domUI.toggle( $('div#pagebuy')[0] );
	});
	
	$('button.btn-buy').on('click', function(){
		var productId = $(this).attr('id');
		if( productId == 'pkg0' ) {
			var msg = hotjs.i18n.get('free_once_per_day');
			var now = Date.now();
			if(! app_data.my.free_time) app_data.my.free_time = 0;
			if( now > app_data.my.free_time + 1000*3600*8 ) {
				app_data.my.gold += 20;
				app_data.my.free_time = now;
				save_data();
				updateDataShow();
				msg = hotjs.i18n.get('free_picked');
			}
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('pkg0info'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
					+ msg + '</p>' );
		} else {
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('buy'), 
					hotjs.i18n.get('payment_method_supported') + '<p>' +
					"<img src='" + __DIR__('img/paypal.png') + "'><p>" +
					"<img src='" + __DIR__('img/iap.png') + "'><p>" +
					hotjs.i18n.get('select_payment_method') + '<p>',
					{
						'paypal' : function(){
							buy( productId, 'paypal' );
							return true;
						},
						'iap' : function(){
							buy( productId, 'iap' );
							return true;
						}
					});			
		}
	});
	
	$('img.icon-info').on('click', function(){
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('info'), 
				"<table>" + 
				"<tr><td><button class='menu' id='btn_yourinfo'>" + hotjs.i18n.get('yourinfo') + "</button></td>" +
				"<td><button class='menu' id='btn_toplist'>" + hotjs.i18n.get('toplist') + "</button></td></tr>" +
				"<tr><td><button class='menu' id='btn_gamerule'>" + hotjs.i18n.get('gamerule') + "</button></td>" +
				"<td><button class='menu' id='btn_gametip'>" + hotjs.i18n.get('gametip') + "</button></td><tr>" +
				"<tr><td><button class='menu' id='btn_welcome'>" + hotjs.i18n.get('welcome') + "</button></td>" +
				"<td><button class='menu' id='btn_about'>" + hotjs.i18n.get('about') + "</button></td><tr>" + 
				"</table>" );
		
		$('button#btn_gamerule').on('click', function(){
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('gamerule'), 
					"<table><tr><td class='l'>" + hotjs.i18n.get('gamerule_text') + "</td></tr></table>"
					);
		});
		$('button#btn_gametip').on('click', function(){
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('gametip'), 
					"<table><tr><td class='l'>" + hotjs.i18n.get('gametip_text') + "</td></tr></table>"
					);
		});
		$('button#btn_welcome').on('click', function(){
			showWelcomeDlg();
		});
		$('button#btn_yourinfo').on('click', function(){
			showPlayerInfoDlg();
		});
		$('button#btn_toplist').on('click', function(){
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('toplist'), 
					"<table>" + 
					"<tr><td><button id='btn_topgold'>" + hotjs.i18n.get('topgold') + "</button></td>" +
					"<td><button id='btn_topwin'>" + hotjs.i18n.get('topwin') + "</button></td>" +
					"<td><button id='btn_toprate'>" + hotjs.i18n.get('toprate') + "</button></td><tr>" + 
					"<tr><td colspan=3>" + hotjs.i18n.get('comingsoon') + "</td></tr>" +
					"</table>" );
		});
		$('button#btn_about').on('click', function(){
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('about'), 
					"<table><tr><td class='m'><img class='logo' src='" + __DIR__('img/icon.png') +  "'><br/>" + hotjs.i18n.get('about_text') + "</td></tr></table>"
					);
		});
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
		showPlayerInfoDlg();
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
		app_data.opt.mute = ! app_data.opt.mute;
		save_data();
		
		toggleAudio();
	});
	
	$('img#icon-music').on('click', function(){
		app_data.opt.music = ! app_data.opt.music;
		save_data();
		
		toggleMusic();
	});
	
	$('img#icon-ad').on('click', function(){
		app_data.opt.ad = ! app_data.opt.ad;
		save_data();
		
		toggleAd();
	});

	$('img#icon-reset').on('click', function(){
	
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

function game_resize(w, h) {
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
		
		var m = Math.min(w, h) - 2;
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
		$(document.body).css({
			'font-size' : '9px',
			'line-height' : '11px'
		});
	}
	
	var pagemain = document.getElementById('pagemain');
	pagemain.innerHTML = 
"<div id='gameView' class='full' style='display:block;'></div>\
<div id='user1' class='userinfo round'>\
<table class='m'>\
<tr>\
<td><img id='my-img' class='icon32 clickable' src='" + __DIR__('img/user2.png') + "'></td>\
<td><img class='icon32' src='" + __DIR__('img/gold.png') + "'><span id='my-gold'>1800</span></td>\
<td><img width=32 id='my-gocolor' src='" + __DIR__('img/blackgo.png') + "'/></td>\
</tr>\
</table></div>\
<div id='user2' class='userinfo round'>\
<table class='m'>\
<tr>\
<td><img width=32 id='peer-gocolor' src='" + __DIR__('img/whitego.png') + "'/></td>\
<td><img class='icon32' src='" + __DIR__('img/gold.png') + "'><span id='peer-gold'>1500</span></td>\
<td><img id='peer-img' class='icon32 clickable' src='" + __DIR__('img/user1.png') + "'></td>\
</tr>\
</table>\
</div>";
	
	pagemain.innerHTML += 
"<div id='controlright' class='control'>\
<table class='control'>\
<tr>\
<tr><td><img class='icon clickable icon-tip' src='" + __DIR__('img/tipoff.png') + "'/></td>\
<td><img class='icon clickable icon-undo' src='" + __DIR__('img/undo.png') + "'/></td></tr>\
<tr><td><img class='icon clickable icon-start' src='" + __DIR__('img/restart.png') + "'/></td>\
<td><img class='icon clickable icon-opt' src='" + __DIR__('img/options.png') + "'/></td></tr>\
<tr><td><img class='icon clickable icon-buy' src='" + __DIR__('img/gold.png') + "'/></td>\
<td><img class='icon clickable icon-info' src='" + __DIR__('img/info.png') + "'/></td></tr>\
</table></div>\
<div id='controlbottom' class='control'>\
<table class='control'>\
<tr>\
<td><img class='icon clickable icon-tip' src='" + __DIR__('img/tipoff.png') + "'/></td>\
<td><img class='icon clickable icon-undo' src='" + __DIR__('img/undo.png') + "'/></td>\
<td><img class='icon clickable icon-start' src='" + __DIR__('img/restart.png') + "'/></td>\
<td><img class='icon clickable icon-opt' src='" + __DIR__('img/options.png') + "'/></td>\
<td><img class='icon clickable icon-buy' src='" + __DIR__('img/gold.png') + "'/></td>\
<td><img class='icon clickable icon-info' src='" + __DIR__('img/info.png') + "'/></td>\
</table></div>";
	
	pagemain.innerHTML += 
"<div id='pageopt' class='dialog round' popup='true' style='display:none;'>\
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
<tr><td colspan=4 style='text-align:left'><span  class='I18N' i18n='boardsize'>Board Size</span></td></tr>\
<tr>\
<td><button class='btn-size set button rosy' v='11'>11</button></td>\
<td><button class='btn-size set button yellow' v='13'>13</button></td>\
<td><button class='btn-size set button green' v='15'>15</button></td>\
<td><button class='btn-size set button cyan' v='17'>17</button></td>\
<td><button class='btn-size set button blue' v='19'>19</button></td>\
</tr>\
<tr>\
<td style='text-align:right'><span  class='I18N' i18n='music'>Music</span></td>\
<td><img id='icon-music' class='icon clickable' src='" + __DIR__('img/music.png') + "' width='32'></td>\
<td colspan=2 style='text-align:right'><span  class='I18N' i18n='ad'>Ad</span></td>\
<td><img id='icon-ad' class='icon clickable' src='" + __DIR__('img/ad.png') + "' width='32'></td>\
</tr>\
<tr>\
<td style='text-align:right'><span  class='I18N' i18n='audio'>Audio</span></td>\
<td><img id='icon-audio' class='icon clickable' src='" + __DIR__('img/audio.png') + "' width='32'></td>\
<td colspan=2 style='text-align:right'><span  class='I18N' i18n='resetdata'>Reset Data</span></td>\
<td><img id='icon-reset' class='icon clickable' src='" + __DIR__('img/reset.png') + "' width='32'></td>\
</tr>\
</table>\
</div>";
	
	pagemain.innerHTML += 
"<div id='pagebuy' class='dialog round' popup='true' style='display:none;'>\
<table class='m'>\
<tr><td></td><td colspan=2><span class='I18N' i18n='buyhappy'>Buy Happy</span></td><td class='r'><img class='icon-buy' src='" + __DIR__('img/x.png') + "'></td></tr>\
<tr><td><img class='icon32' src='" + __DIR__('img/gold.png') +"'/></td><td class='l'><span class='I18N' i18n='pkg0'>5 golds</span></td><td class='r'><span class='I18N' i18n='pkg0info'>FREE everyday</span></td><td><button id='pkg0' class='btn-buy I18N' i18n='pkg0price'>Get It</button></td><td></td></tr>\
<tr><td><img class='icon48' src='" + __DIR__('img/gold2.png') +"'/></td><td class='l'><span class='I18N' i18n='pkg1'>500 golds</span></td><td class='r'><span class='I18N' i18n='pkg1info'>&nbsp;</span></td><td><button id='pkg1' class='btn-buy I18N' i18n='pkg1price'>$ 1</button></td><td></td></tr>\
<tr><td><img class='icon48' src='" + __DIR__('img/gold3.png') +"'/></td><td class='l'><span class='I18N' i18n='pkg2'>2000 golds</span></td><td class='r'><span class='I18N' i18n='pkg2info'>50% OFF</span></td><td><button id='pkg2' class='btn-buy I18N' i18n='pkg2price'>$ 2</button></td><td></td></tr>\
<tr><td><img class='icon48' src='" + __DIR__('img/gold4.png') +"'/></td><td class='l'><span class='I18N' i18n='pkg3'>10000 golds</span></td><td class='r'><span class='I18N' i18n='pkg3info'>70% OFF</span></td><td><button id='pkg3' class='btn-buy I18N' i18n='pkg3price'>$ 6</button></td><td></td></tr>\
</table>\
</div>";
	
}

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
		               resources.get(__DIR__('img/greengo.png')),
		               resources.get(__DIR__('img/highlight.png'))		               
		                ])
		.showImg(true)
		.setDraggable(true).setMoveable(true).setZoomable(true)
		.setPeerPlayer( ai_player )
		.setJudge( ai_player )
		.onGo( playMoveSound )
		.addTo( gameView )
		.resetGame();
	
	hotjs.i18n.translate();
	
	game_resize();

	updateDataShow();

	hotjs.domUI.showSplash( false );
	
	if( window.plugins && window.plugins.AdMob ) {
		var am = window.plugins.AdMob;
		am.requestAd({ 'isTesting':false }, function(){}, function(){});
	}

	toggleAudio();
	toggleMusic();
	toggleAd();
	
	resources.playAudio( __DIR__('audio/hello.mp3') );

	app.addNode(gameView).start();
	
	if( ! app_data.opt.get_gift ) {
		showWelcomeDlg();		
	}
}

var res = 
[
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
   __DIR__('img/highlight.png'),
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
   __DIR__('img/audiomute.png'),
   __DIR__('img/music.png'),
   __DIR__('img/musicoff.png'),
   __DIR__('img/ad.png'),
   __DIR__('img/adoff.png'),
   __DIR__('img/paypal.png'),
   __DIR__('img/iap.png')
   
  ];

function game_init() {
	// show logo
	hotjs.domUI.showSplash( true, 
			"<h1>GOMOKU<br/>MIST</h1><img class='logo' src='" + __DIR__('img/icon.png') + "'/><h3>&copy; RNJSOFT</h3>",
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

