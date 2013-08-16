
hotjs = hotjs || {};

var ai_go = ai_go || {};

(function(){

var __FILE__;

// Method 1: get path using the last loaded script, 
// remember, we must append script in resource preloading.
var scripts = document.getElementsByTagName("script");
__FILE__ = scripts[scripts.length - 1].src;
if( ! __FILE__ ) __FILE__ = scripts[scripts.length - 2].src;

// Method 2: get with error exception
try {
    throw Error("get js path");
}catch(ex){
    if(ex.fileName) { //Firefox
        __FILE__ = ex.fileName;
    } else if(ex.sourceURL) { //Safari
        __FILE__ = ex.sourceURL;
    } else if(ex.stack) { //Chrome or IE10+
        __FILE__ = (ex.stack.match(/at\s+(.*?):\d+:\d+/)||['',''])[1];
    }
}

var __DIR__ = function(f) {
	return hotjs.getAbsPath(f, __FILE__);
};

var gameView;
var board;
var ai_player;
var net_player;
var worker;
var dialog;

var app_key = 'com.rnjsoft.GomokuMist';

var touch_event = 'click';
if( /(ipad|iphone|ipod|android)/i.test(navigator.userAgent) ) {
	touch_event = 'touchstart';
}

var tLoadingStart = Date.now();

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
				win : 0,
				email : '',
				twitter : '',
				facebook : '',
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
				info : true,
				ad : true
			};
	}
	if( data.opt.level < 1 || data.opt.level > 5 ) {
		data.opt.level = 2;
	}
	if( data.my.gold <= 0 ) {
		data.opt.ad = true;
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
						"<img class='icon192' src='"+ __DIR__('img/win.png') + "'><p>" 
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
			resources.playAudio( __DIR__('audio/magic.mp3'), true );
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
			var peer = app_data.ais[ 'peer' + app_data.opt.level ];
			if( msg.used_time < peer.think_time ) {
				window.setTimeout( function(){
					board.go( bestMove[0], bestMove[1] );
				}, (peer.think_time - msg.used_time) );				
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
	app_data.opt.ad = !! app_data.opt.ad;
	
	if( app_data.opt.ad ) {
		$('img#icon-ad').attr('src', __DIR__('img/ad.png') );
	} else {
		$('img#icon-ad').attr('src', __DIR__('img/adoff.png') );
	}

	if( window.plugins ) {
		if ( window.plugins.iAd && window.plugins.iAd.inUse ) {
			window.plugins.iAd.showAd( app_data.opt.ad ); 
		}
		if( window.plugins.AdMob && window.plugins.AdMob.inUse ) {
			var isTesting = window.plugins.AdMob.isTesting;
			if(! window.plugins.AdMob.requested) {
				window.plugins.AdMob.requestAd({ 'isTesting':isTesting }, function(){
					window.plugins.AdMob.requested = true;
				}, function(){});
			}
			window.plugins.AdMob.showAd( app_data.opt.ad );
		}
	}	
}

// loop play: music1.mp3, music2.mp3, music3.mp3
var music_index = 1;
function toggleMusic() {
	var music_file = __DIR__('audio/music' + music_index + '.mp3');
	if( app_data.opt.music ) {
		resources.playAudio(music_file, false, true);
		$('img#icon-music').attr('src', __DIR__('img/music.png') );
	} else {
		resources.stopAudio(music_file);
		$('img#icon-music').attr('src', __DIR__('img/musicoff.png') );
		music_index ++;
		if(music_index > 3) music_index = 1;
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

var productsOnSale = {
		'com.rnjsoft.GomokuMist.pkg1' : {
			golds: 500,
			valid: true
		},
		'com.rnjsoft.GomokuMist.pkg2' : {
			golds: 2000,
			valid: true
		},
		'com.rnjsoft.GomokuMist.pkg3' : {
			golds: 10000,
			valid: true
		}
};

function payWithPaypalMPL( pkgid ) {
	if(! window.plugins) return;
	if(! window.plugins.PayPalMPL) return;	
	
	var ppm = window.plugins.PayPalMPL;

	ppm.prepare( ppm.PaymentType.GOODS, function(){
	}, function(){
	});	 
	
	var name = hotjs.i18n.get( pkgid ) + ' ' + hotjs.i18n.get( 'golds' );
	var subTotal = hotjs.i18n.get( pkgid + '_subTotal' );
	var currency = hotjs.i18n.get( 'currency' );

	ppm.setPaymentInfo({
			'paymentCurrency' : currency,
			'subTotal' : subTotal,
			'recipient' : 'rnjsoft.mobile@gmail.com',
			'description' : 'game coin (' + name + ')',
			'merchantName' : 'GomokuMist'
		}, function() {
			ppm.pay({}, function() {
				var n = productsOnSale[ 'com.rnjsoft.GomokuMist.' + pkgid ].golds;
				app_data.my.gold += n;
				save_data();
				updateDataShow();
				
				hotjs.domUI.dismiss(dialog);

				dialog = hotjs.domUI.popupDialog(hotjs.i18n.get('paydone'),
						"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
						hotjs.i18n.get('get500happy').replace('500', n) + '</p>');
			}, function() {
				hotjs.domUI.dismiss(dialog);

				dialog = hotjs.domUI.popupDialog(hotjs.i18n.get('payfailed'),
						"<img src='" + __DIR__('img/shrug.png') + "'><p>"
								+ hotjs.i18n.get('payfailed_retrylater')
								+ '</p>');
			});
		}, function() {
			hotjs.domUI.dismiss(dialog);

			dialog = hotjs.domUI.popupDialog(hotjs.i18n.get('payfailed'),
					"<img src='" + __DIR__('img/shrug.png') + "'><p>"
							+ hotjs.i18n.get('payfailed_retrylater') + '</p>');
		});
}

function requestIAPProductInfo() {
	var iap = window.plugins.InAppPurchaseManager;
	var productIds = [];
	for( var k in productsOnSale ) {
		productIds.push( k );
	}
	iap.requestProductData( 
		productIds, 
		function( data ) {
			window.plugins.InAppPurchaseManager.inUse = true;
			
			var validProducts = data.validProducts;
			if( Array.isArray(validProducts) && (validProducts.length > 0) ) {
				$('button#btn-iap').removeAttr('disabled');
			} else {
				$('button#btn-iap').attr('disabled', 'disabled');
			}
			
			var invalidIds = data.invalidIds;
			if( Array.isArray(invalidIds) ) {
				for( var k in invalidIds ) {
					productsOnSale[ k ].valid = false;
				}
			}
			
		}, function() {
			$('button#btn-iap').attr('disabled', 'disabled');
			
			window.setTimeout( requestIAPProductInfo, 1000 * 30 );
		}
	);	
}

function initIAP() {
	if(! window.plugins) return;
	if(! window.plugins.InAppPurchaseManager) return;
	
	document.addEventListener('onInAppPurchaseSuccess', function(event){
		// event.productId
		// event.transactionId
		// event.transactionReceipt
		
		var product = productsOnSale[ event.productId ];
		if(! product) return;
		
		app_data.my.gold += product.golds;
		save_data();
		updateDataShow();

		hotjs.domUI.dismiss(dialog);

		dialog = hotjs.domUI.popupDialog(hotjs.i18n.get('paydone'),
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
					hotjs.i18n.get('get500happy').replace('500', product.golds) + '</p>');
	});

	document.addEventListener('onInAppPurchaseFailed', function(event){
		// event.errorCode
		// event.errorMsg
		hotjs.domUI.dismiss(dialog);
		
		dialog = hotjs.domUI.popupDialog( hotjs.i18n.get('payfailed'), event.errorMsg);
	});

	document.addEventListener('onInAppPurchaseRestored', function(event){
		// event.productId
		// event.transactionId
		// event.transactionReceipt
	});
	
	window.plugins.InAppPurchaseManager.setup();;

	requestIAPProductInfo();
}

function payWithIAP( pkgid ) {
	if(! window.plugins) return;
	if(! window.plugins.InAppPurchaseManager) return;	
	
	var iap = window.plugins.InAppPurchaseManager;
	
	var productId = 'com.rnjsoft.GomokuMist.' + pkgid;
	iap.makePurchase( productId, 1, function(){}, function(){} );
}

function buyProduct( productId ) {
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
		hotjs.domUI.toggle( $('div#pagebuy')[0] );
		
		var imgs = {
				'pkg1' : __DIR__('img/gold2.png'),
				'pkg2' : __DIR__('img/gold3.png'),
				'pkg3' : __DIR__('img/gold4.png')
		};
		dialog = hotjs.domUI.popupDialog( 
				"<img class='icon48' src='" + imgs[productId] +  "'><br/>" + 
				hotjs.i18n.get( productId ) + ' ' + hotjs.i18n.get('golds') + '<br/>' +
				hotjs.i18n.get( productId + 'price' ), 
				'<p>' + hotjs.i18n.get('select_payment') + '</p>' +
				"<button id='btn-iap' class='button round btn-buy'><img class='btn-buy' src='" + __DIR__('img/iap.png') + "'></button><br/> " +
				"<button id='btn-paypal' class='button round btn-buy'><img class='btn-buy' src='" + __DIR__('img/paypal.png') + "'></button>" 
				);
		
		if( window.plugins && 
				window.plugins.InAppPurchaseManager &&
				window.plugins.InAppPurchaseManager.inUse ) {
			$('button#btn-iap').on('click', function(){
				$(this).html("<img src='" + resources.getLoadingGif() + "'>");
				$(this).attr('disabled', 'disabled');
				payWithIAP( productId );
			});
		} else {
			$('button#btn-iap').css({'display':'none'});
		}
		
		if( window.plugins &&
				window.plugins.PayPalMPL &&
				window.plugins.PayPalMPL.inUse ) {
			$('button#btn-paypal').on('click', function(){
				$(this).html("<img src='" + resources.getLoadingGif() + "'>");
				$(this).attr('disabled', 'disabled');
				payWithPaypalMPL( productId );
			});
		} else {
			$('button#btn-paypal').css({'display':'none'});
		}
	}
}

function watchAdGetGift() {
	if(! app_data.my.adtime) app_data.my.adtime = 0;
	if(! app_data.my.adclicks) app_data.my.adclicks = 0;
	if(! app_data.my.adtotal) app_data.my.adtotal = 0;
	
	var now = Date.now();
	if( now > app_data.my.adtime + 1000 * 3600 ) {
		app_data.my.adclicks = 0;
	}
	
	if( app_data.my.adclicks < 2 ) {
		app_data.my.gold += 10;
		
		app_data.my.adclicks ++;
		app_data.my.adtotal ++;
		app_data.my.adtime = now;

		save_data();
		updateDataShow();
	}	
}

function popupNeedGoldDlg() {
	if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
	dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get('nogold'), 
			"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
			+ hotjs.i18n.get('nogoldcannotdo') + '</p>', {
				'buy':function(){
					hotjs.domUI.dismiss( dialog );
					hotjs.domUI.toggle( $('div#pagebuy')[0] );
					return true;
				},
				'watchad':function(){
					hotjs.domUI.dismiss( dialog );
					toggleAd();
					app_data.opt.ad = true;
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
			hotjs.i18n.get( 'myinfo' ), 
			"<table>" + 
			"<tr><td nowrap>" + hotjs.i18n.get('win') + "</td><td class='m'>" + + app_data.my.win + '/' + app_data.my.total + 
			" ( " + Math.round(my_winrate * 100) + "% )</td>" +
			"<tr><td>" + hotjs.i18n.get('name') + "</td><td class='m'><input class='round m' id='myname' size=24 value='"+ app_data.my.name + "'/></td>" + 
			"<tr><td>" + hotjs.i18n.get('email') + "</td><td class='m'><input class='round m' id='myemail' size=24 value='"+ app_data.my.email + "'/></td>" + 
			"<tr><td>" + hotjs.i18n.get('twitter') + "</td><td class='m'><input class='round m' id='mytwitter' size=24 value='"+ app_data.my.twitter + "'/></td>" + 
			"<tr><td>" + hotjs.i18n.get('facebook') + "</td><td class='m'><input class='round m' id='myfacebook' size=24 value='"+ app_data.my.facebook + "'/></td>" + 
			"<tr><td>" + hotjs.i18n.get('device') + "</td><td class='l' style='width:192px;'>" + navigator.userAgent + "</td>" + 
			"</table>", {
				'save' : function() {
					app_data.my.name = $('input#myname').val();
					app_data.my.email = $('input#myemail').val();
					app_data.my.twitter = $('input#mytwitter').val();
					app_data.my.facebook = $('input#myfacebook').val();
					save_data();
					//alert( JSON.stringify( app_data ) );
					return true;
				},
				'cancel' : function() {
					return true;
				}
			} );
}

function init_events() {
	$(window).resize( game_resize );
	
	$('.clickable').on(touch_event, function(){
		resources.playAudio( __DIR__('audio/click.mp3'), true );
	});
	
	document.addEventListener( 'onClickAd', watchAdGetGift );
	
	$('img.icon-start').on('click', function(){
		if( board.gameOver ){
			restartGame();
		} else {
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('giveup'),
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('confirmgiveup') + "</p>",
	 				{
						'ok' : function() {
							var peer = app_data.ais[ 'peer' + app_data.opt.level ];
							
							app_data.my.gold -= peer.per;
							app_data.my.total ++;

							peer.total ++;
							peer.win ++;
							peer.gold += peer.per;
							save_data();
							
							restartGame();
							
							return true;
						},
						'cancel' : function() {
							return true;
						}
					});			
		}
	});
	
	$('img.icon-undo').on('click', function(){
		if( ! board.canUndo() ) {
			if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('notstarted'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('notstartedcannotdo') + '</p>' );
		} else if( board.gameOver ) {
			if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('gameover'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('gameovercannotdo') + '</p>' );
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

	$('img.icon-tip').on(touch_event, function(){
		if( ! board.canUndo() ) {
			if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('notstarted'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('notstartedcannotdo') + '</p>' );
		} else if( board.gameOver ) {
			if( dialog ) { hotjs.domUI.dismiss( dialog ); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('gameover'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('gameovercannotdo') + '</p>' );
		} else if ( app_data.my.gold >= 1 ) {
			toggleTip(! board.getTipStatus() );
		} else {
			popupNeedGoldDlg();
		}
	});
	
	$('img.pageopt').on(touch_event, function(){
		hotjs.domUI.dismiss( dialog );
		hotjs.domUI.toggle( $('div#pageopt')[0] );
	});
	$('img.pageopt_x').on('click', function(){
		hotjs.domUI.toggle( $('div#pageopt')[0] );
	});
	
	$('img.pagebuy').on(touch_event, function(){
		hotjs.domUI.dismiss( dialog );
		hotjs.domUI.toggle( $('div#pagebuy')[0] );
	});
	$('img.pagebuy_x').on('click', function(){
		hotjs.domUI.toggle( $('div#pagebuy')[0] );
	});
	
	$('button.btn-buy').on('click', function(){
		var productId = $(this).attr('id');
		buyProduct( productId );
	});

	$('img.pageinfo').on(touch_event, function(){
		hotjs.domUI.dismiss( dialog );
		hotjs.domUI.toggle( $('div#pageinfo')[0] );
	});
	$('img.pageinfo_x').on('click', function(){
		hotjs.domUI.toggle( $('div#pageinfo')[0] );
	});
	
	$('button#btn_gamerule').on(touch_event, function(){
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('gamerule'), 
				"<table><tr><td class='l'>" + hotjs.i18n.get('gamerule_text') + "</td></tr></table>"
				);
	});
	$('button#btn_gametip').on(touch_event, function(){
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('gametip'), 
				"<table><tr><td class='l'>" + hotjs.i18n.get('gametip_text') + "</td></tr></table>"
				);
	});
	$('button#btn_welcome').on(touch_event, function(){
		showWelcomeDlg();
	});
	$('button#btn_yourinfo').on('click', function(){
		showPlayerInfoDlg();
	});
	$('button#btn_toplist').on('click', function(){
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('toplist'), 
				"<table>" + 
				"<tr><td><button id='btn_topgold' class='dialog button yellow'>" + hotjs.i18n.get('topgold') + "</button></td>" +
				"<td><button id='btn_topwin' class='dialog button green'>" + hotjs.i18n.get('topwin') + "</button></td>" +
				"<td><button id='btn_toprate' class='dialog button cyan'>" + hotjs.i18n.get('toprate') + "</button></td><tr>" + 
				"<tr><td colspan=3>" + hotjs.i18n.get('comingsoon') + "</td></tr>" +
				"</table>" );
	});
	$('button#btn_about').on(touch_event, function(){
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('gamename'), 
				"<table><tr><td class='m'><img class='icon128 round' src='" + __DIR__('img/icon256.png') +  "'><br/>" + hotjs.i18n.get('about_text') + "</td></tr></table>"
				);
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

	$('img#peer-img').on(touch_event, function(){
		var char_id = app_data.opt.level;
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get( 'peer' + char_id ), 
				genBriefInfo( char_id ),
				{
					'selectpeer' : function() {
						hotjs.domUI.toggle( $('div#pageopt')[0] );
						return true;
					}
				}
				);
	});
	
	$('img#my-img').on(touch_event, function(){
		showPlayerInfoDlg();
	});

	$('img.btn-char').on(touch_event, function(){
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
						
						hotjs.domUI.toggle( $('div#pageopt')[0] );
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
		
		hotjs.domUI.toggle( $('div#pageopt')[0] );
		
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
	pg.css({'top': ((h-sh)/2 - 10) +'px', 'left': ((w-sw)/2) + 'px'});
	
	pg = $('div#pagebuy');
	sw = pg.width(), sh = pg.height();
	pg.css({'top': ((h-sh)/2 - 10) +'px', 'left': ((w-sw)/2) + 'px'});

	pg = $('div#pageinfo');
	sw = pg.width(), sh = pg.height();
	pg.css({'top': ((h-sh)/2 - 10) +'px', 'left': ((w-sw)/2) + 'px'});

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

function packDialogHTML( dlg_id, content ) {
	var ret = 
"<div id='" + dlg_id + "' class='dialog round' popup='true' style='display:none;'>\
<table class='dialog' cellspacing='0' cellpadding='0'>\
<tr><td class='dlg00'></td><td class='dlg01 m'></td><td class='dlg02'><img class='dlgx " + dlg_id + "_x' src='" + __DIR__('img/x.png') + "'></td></tr>\
<tr><td class='dlg10'></td><td class='dlg11 m'><div class='dlg11'>" + content + "</div></td><td class='dlg12'></td></tr>\
<tr><td class='dlg20'></td><td class='dlg21'></td><td class='dlg22'></td></tr>\
</table></div>";
	return ret;
}

function init_UI() {
	var pagemain = document.getElementById('pagemain');
	pagemain.innerHTML = '';
	
	if( /(ipad)/i.test(navigator.userAgent) ) {
		pagemain.innerHTML += 
"<style TYPE='text/css'>\
img.icon, img.icon32, img.icon48 { width:64px; height:64px; }\
img.logo, img.icon128 { width:256px; height:256px; }\
img.dlgx { width:48px; height:48px; }\
body, div, td, button, p, span, input { font-size:24px; }\
button.dialog { height:64px; }\
button.set { width:64px; height:64px; }\
button.menu { width:144px; height:64px; }\
</style>";
	}	
	
	pagemain.innerHTML +=
"<div id='gameView' class='full' style='display:block;'></div>\
<div id='user1' class='userinfo round shadow'>\
<table class='m'>\
<tr>\
<td><img id='my-img' class='icon32 clickable' src='" + __DIR__('img/user2.png') + "'></td>\
<td><img class='icon32' src='" + __DIR__('img/gold.png') + "'><span id='my-gold'>1800</span></td>\
<td><img id='my-gocolor' class='icon32' src='" + __DIR__('img/blackgo.png') + "'/></td>\
</tr>\
</table></div>\
<div id='user2' class='userinfo round shadow'>\
<table class='m'>\
<tr>\
<td><img id='peer-gocolor' class='icon32' src='" + __DIR__('img/whitego.png') + "'/></td>\
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
<td><img class='icon clickable pageopt' src='" + __DIR__('img/options.png') + "'/></td></tr>\
<tr><td><img class='icon clickable pagebuy' src='" + __DIR__('img/gold.png') + "'/></td>\
<td><img class='icon clickable pageinfo' src='" + __DIR__('img/info.png') + "'/></td></tr>\
</table></div>\
<div id='controlbottom' class='control'>\
<table class='control'>\
<tr>\
<td><img class='icon clickable icon-tip' src='" + __DIR__('img/tipoff.png') + "'/></td>\
<td><img class='icon clickable icon-undo' src='" + __DIR__('img/undo.png') + "'/></td>\
<td><img class='icon clickable icon-start' src='" + __DIR__('img/restart.png') + "'/></td>\
<td><img class='icon clickable pageopt' src='" + __DIR__('img/options.png') + "'/></td>\
<td><img class='icon clickable pagebuy' src='" + __DIR__('img/gold.png') + "'/></td>\
<td><img class='icon clickable pageinfo' src='" + __DIR__('img/info.png') + "'/></td>\
</table></div>";
	
	pagemain.innerHTML += packDialogHTML( 'pageopt', 
"<table class='m'>\
<tr><td></td><td colspan=3><span class='I18N' i18n='options'>Options</span></td><td class='r'></td></tr>\
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
<td><button class='btn-size clickable set button rosy' v='11'>11</button></td>\
<td><button class='btn-size clickable set button yellow' v='13'>13</button></td>\
<td><button class='btn-size clickable set button green' v='15'>15</button></td>\
<td><button class='btn-size clickable set button cyan' v='17'>17</button></td>\
<td><button class='btn-size clickable set button blue' v='19'>19</button></td>\
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
</table>" );
	
	pagemain.innerHTML += packDialogHTML( 'pagebuy', 
"<table>\
<tr><td colspan=3 class='m'><span class='I18N' i18n='buyhappy'>Buy Happy</span></td></tr>\
<tr><td><img class='icon32' src='" + __DIR__('img/gold.png') +"'/></td><td class='l I18N' i18n='pkg0'>5 golds</td><td><button id='pkg0' class=' clickable button cyan btn-buy I18N' i18n='pkg0price'>Get It</button></td></tr>\
<tr><td><img class='icon48' src='" + __DIR__('img/gold2.png') +"'/></td><td class='l I18N' i18n='pkg1'>500 golds</td><td><button id='pkg1' class=' clickable button green btn-buy I18N' i18n='pkg1price'>$ 1</button></td></tr>\
<tr><td><img class='icon48' src='" + __DIR__('img/gold3.png') +"'/></td><td class='l I18N' i18n='pkg2'>2000 golds</td><td><button id='pkg2' class=' clickable button yellow btn-buy I18N' i18n='pkg2price'>$ 2</button></td></tr>\
<tr><td><img class='icon48' src='" + __DIR__('img/gold4.png') +"'/></td><td class='l I18N' i18n='pkg3'>10000 golds</td><td><button id='pkg3' class=' clickable button gold btn-buy I18N' i18n='pkg3price'>$ 6</button></td></tr>\
</table>" );
	
	pagemain.innerHTML += packDialogHTML( 'pageinfo', 
"<table>" + 
"<tr><td colspan=2 class='m I18N' i18n='info'>Info</td></tr>" +
"<tr><td><button class=' clickable menu button rosy' id='btn_yourinfo'>" + hotjs.i18n.get('myinfo') + "</button></td>" +
"<td><button class=' clickable menu button gold' id='btn_toplist'>" + hotjs.i18n.get('toplist') + "</button></td></tr>" +
"<tr><td><button class=' clickable menu button yellow' id='btn_gamerule'>" + hotjs.i18n.get('gamerule') + "</button></td>" +
"<td><button class=' clickable menu button green' id='btn_gametip'>" + hotjs.i18n.get('gametip') + "</button></td><tr>" +
"<tr><td><button class=' clickable menu button cyan' id='btn_welcome'>" + hotjs.i18n.get('welcome') + "</button></td>" +
"<td><button class=' clickable menu button blue' id='btn_about'>" + hotjs.i18n.get('about') + "</button></td><tr>" + 
"</table>" );
}

initIAP();

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
		.setMaxFps( 25 )
		.showFPS(false);

	ai_player = new AIPlayer().init();
	
	function playMoveSound( player ){
		if( player == 1 ) {
			resources.playAudio( __DIR__('audio/move2.mp3'), true );
		} else {
			resources.playAudio( __DIR__('audio/move.mp3'), true );
		}
	}
	
	board = (new GoBoard( app_data.opt.size ))
		.setSize(w, h).showGrid(false)
		.setColor("white").setGridStyle(true)
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
	toggleAudio();
	toggleMusic();
	app.addNode(gameView).start();

	var tLoadingDone = Date.now();
	var tUsed = tLoadingDone - tLoadingStart;
	var tWait = ( tUsed < 3000 ) ? (3000 - tUsed) : 10; 
	window.setTimeout( function() {
		hotjs.domUI.showSplash( false );
		//resources.playAudio( __DIR__('audio/hello.mp3'), true );
		toggleAd();
		if( ! app_data.opt.get_gift ) {
			showWelcomeDlg();		
		}
	}, tWait );
}

var res = 
[
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
   __DIR__('img/dlg00.png'),
   __DIR__('img/dlg01.png'),
   __DIR__('img/dlg02.png'),
   __DIR__('img/dlg10.png'),
   __DIR__('img/dlg11.png'),
   __DIR__('img/dlg12.png'),
   __DIR__('img/dlg20.png'),
   __DIR__('img/dlg21.png'),
   __DIR__('img/dlg22.png'),
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
   __DIR__('img/iap.png'),
   __DIR__('img/loading16.gif')
  ];

function game_init() {
	// show logo
	hotjs.domUI.showSplash( true, 
			"<h1>GOMOKU<br/>MIST</h1><img class='logo round shadow' src='" + __DIR__('img/icon256.png') + "'/><h3>&copy; RNJSOFT</h3>",
			{'background':'white'} );

	resources.preloadMusic([ 
	                        __DIR__('audio/music1.mp3'), 
	                        __DIR__('audio/music2.mp3'), 
	                        __DIR__('audio/music3.mp3') 
	                        ]);
	resources.preloadFX([ 
	                        __DIR__('audio/click.mp3'), 
	                        __DIR__('audio/hello.mp3'), 
	                        __DIR__('audio/magic.mp3'), 
	                        __DIR__('audio/move2.mp3'), 
	                        __DIR__('audio/move.mp3') 
	                        ]);	
	
	resources.load( res, { ready: game_main } );
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

