
hotjs = hotjs || {};

var ai_go = ai_go || {};

(function(){

// configuration 
var app_key = 'com.rnjsoft.Gomoku';

var app_version = 2.1;

var using_iad = false;
var enable_paypal_in_ios = false;

var admob_ios_key = 'a151e6d43c5a28f';
var admob_android_key = 'a151e6d65b12438';

var paypal_app_id = 'APP-24H42331EP409445J'; // LIVE
//var paypal_app_id = 'APP-80W284485P519543T'; // SANDBOX

var apple_iap_products = {};
apple_iap_products[ app_key + '.pkg1' ] = { golds: 500, valid: true };
apple_iap_products[ app_key + '.pkg2' ] = { golds: 2000, valid: true };
apple_iap_products[ app_key + '.pkg3' ] = { golds: 10000, valid: true };

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

var app_data;
var gameView;
var board;
var ai_agent;
var net_player;
var worker;
var dialog;

function isMobileDevice() {
	return ( /(ipad|iphone|ipod|android)/i.test(navigator.userAgent) ); 
}

function isIOSDevice(){
	return ( /(ipad|iphone|ipod)/i.test(navigator.userAgent) );
}

function isAndroidDevice() {
	return ( /(android)/i.test(navigator.userAgent) );
}

var touch_event = isMobileDevice() ? 'touchstart' : 'click';

var tLoadingStart = Date.now();

function init_iAd() {
	if( window.plugins.iAd ) {
		window.plugins.iAd.createBannerView({'bannerAtTop':false},function(){
	    	window.plugins.iAd.inUse = true;
	    },function(){
	    });
	}
}

function init_AdMob() {
	if ( window.plugins.AdMob ) {
	    var adId = (navigator.userAgent.indexOf('Android') >=0) ? admob_android_key : admob_ios_key;
	    
	    var am = window.plugins.AdMob;
	    am.createBannerView( 
	    		{
		            'publisherId': adId,
		            'adSize': am.AD_SIZE.BANNER,
		            'bannerAtTop': false
	            }, function() {
	            	window.plugins.AdMob.isTesting = false; // change it to false later
	            	window.plugins.AdMob.inUse = true;
	            }, function(){
	            });
	}	
}


function init_PayPalMPL() {
	if(! window.plugins.PayPalMPL) return;
	
    var ppm = window.plugins.PayPalMPL;
    var appEnv = ('APP-80W284485P519543T' === paypal_app_id) ? ppm.PaymentEnv.ENV_SANDBOX : ppm.PaymentEnv.ENV_LIVE;
    ppm.initWithAppID( {
	      'appId': paypal_app_id,
	      'appEnv': appEnv
	      }, function(){
	    	  window.plugins.PayPalMPL.inUse = true;
	      }, function(){
	      });
}

var NPC_config = {
	peer1 : { level: 1, think_time: 500, attack_factor: 1.1, perwin: 5, winrate: 0.5 },	
	peer2 : { level: 2, think_time: 300, attack_factor: 1.1, perwin: 10, winrate: 0.6 },	
	peer3 : { level: 3, think_time: 10, attack_factor: 1.2, perwin: 20, winrate: 0.75 },	
	peer4 : { level: 3, think_time: 500, attack_factor: 0.9, perwin: 40, wirate: 0.8 },	
	peer5 : { level: 4, think_time: 1000, attack_factor: 1.1, perwin: 80, winrate: 1 }	
};

var NPC_data_default = {
	peer1 : { gold: 99, total: 10, win: 3, recent: [] },	
	peer2 : { gold: 499, total: 100, win: 51, recent: [] },	
	peer3 : { gold: 999, total: 200, win: 122, recent: [] },	
	peer4 : { gold: 4999, total: 500, win: 335, recent: [] },	
	peer5 : { gold: 9999, total: 1000, win: 802, recent: [] }	
};

function load_data() {
	var data = {};
	var data_str = localStorage.getItem( app_key );
	if( data_str ) {
		data = JSON.parse( data_str );
	}
	if( (! data.app_version) || (data.app_version < app_version) ) {
		data.app_version = app_version;
		
		// do some update action here
		if(!! data.ais) delete data.ais;
	}
	if(! data.npc_data ) {
		data.npc_data = NPC_data_default;
	}
	if(! data.my) {
		data.my = {
				name : 'player',
				gold : 0,
				total : 0,
				win : 0,
				email : '',
				twitter : '',
				facebook : ''
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
	
	app_data = data;
}

function save_data() {
	localStorage.setItem( app_key, JSON.stringify(app_data) );
}

function restartGame(){
	if( dialog ) { dialog.dismiss(); dialog=null; }
	
	board.exchangeColor();
	updateDataShow();

	board.resetGame();
}

function onMyWin() {
	window.setTimeout( function(){
		var peerN = 'peer' + app_data.opt.level;
		var npc = NPC_config[ peerN ];
		var npc_data = app_data.npc_data[ peerN ];

		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('youwin'), 
				"<img class='icon192' src='"+ __DIR__('img/win.png') + "'><p>" 
				+ hotjs.i18n.get('youwin10gold').replace('10',npc.perwin) + '</p>',
				{
					'playagain':function(){
						restartGame();
						return true;
					}
				} );
		app_data.my.gold += npc.perwin;
		app_data.my.total ++;
		app_data.my.win ++;

		npc_data.total ++;
		npc_data.gold -= npc.perwin;

		if(! npc_data.recent) npc_data.recent = [];
		npc_data.recent.push( 0 );
		
		var recent = npc_data.recent;
		while( recent.length > 10 ) recent.shift();
		if( recent.length > 0 ) {
			var win = 0;
			for( var i=0; i<recent.length; i++ ) {
				if( recent[i] ) win ++;
			}
			npc_data.winrate = win / recent.length;
		} else {
			npc_data.winrate = 0;
		}
		
		save_data();
		
		updateDataShow();
	}, 1500);	
}

function onMyLost() {
	window.setTimeout(function() {
		var peerN = 'peer' + app_data.opt.level;
		var npc = NPC_config[ peerN ];
		var npc_data = app_data.npc_data[ peerN ];
		
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('youlost'), 
				"<img src='"+ __DIR__('img/peer' + app_data.opt.level + '-128.png') + "'><p>" 
				+ hotjs.i18n.get('youlost10gold').replace('10', npc.perwin) + '</p>',
				{
					'playagain':function(){
						restartGame();
						return true;
					}
				} );
		
		app_data.my.gold -= npc.perwin;
		app_data.my.total ++;

		npc_data.total ++;
		npc_data.win ++;
		npc_data.gold += npc.perwin;
		
		if(! npc_data.recent) npc_data.recent = [];
		npc_data.recent.push( 1 );
		
		var recent = npc_data.recent;
		while( recent.length > 10 ) recent.shift();
		if( recent.length > 0 ) {
			var win = 0;
			for( var i=0; i<recent.length; i++ ) {
				if( recent[i] ) win ++;
			}
			npc_data.winrate = win / recent.length;
		} else {
			npc_data.winrate = 0;
		}
		
		save_data();
		
		updateDataShow();
	}, 1500);	
}

function onAIMessage(evt) {
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
		if( s.myWinHits.length > 0 ) {
			board.gameOver = true;
			onMyLost();
		}
		if ( s.peerWinHits.length > 0 ) {
			board.gameOver = true;
			onMyWin();
		}
		if( board.gameOver ) {
			resources.playAudio( __DIR__('audio/magic.mp3'), true );
		}
		break;
	case 'go':
		if( dialog ) { dialog.dismiss(); dialog=null; }
		
		if( board.getTipStatus() ) toggleTip( false );
		
		var s = msg.solution;
		var t = s.topMoves;
		var bestMove = s.bestMove;
		//var bestMove = (s.topMoves.length>0) ? s.topMoves[0] : s.bestMove;

		if( ! board.gameOver ) {
			var peerN = 'peer' + app_data.opt.level;
			var npc = NPC_config[ peerN ];
			var npc_data = app_data.npc_data[ peerN ];
			//var tops = 'best: ' + Math.floor(bestMove[2]) + ', top: ';
			//for(var i=0; i<t.length; i++) { tops += ' ' + Math.floor(t[i][2]); } console.log( tops );
			if( bestMove[2] >= 1000 ) { // must react if already 4, or too stupid
				//console.log( 'block!' );
			} else {
				var guess = -1;
				if( npc_data.winrate > npc.winrate ) {
					guess = Date.now() % Math.max(3, (5 - npc.level));
				} else if ( bestMove[2] < 100 ) {
					guess = Date.now() % 3; // random to avoid repeat step
				} else { // keep the top move
				}
				
				for( var i=0; i<t.length; i++ ) {
					if( i == guess ) {
						var m = t[i];
						if( m[2] < 10 ) break; // ignore stupid step
						bestMove = [ m[0], m[1], m[2] ];
						break;
					}
				}
			}
			
			if( msg.used_time < npc.think_time ) {
				window.setTimeout( function(){
					board.go( bestMove[0], bestMove[1] );
				}, (npc.think_time - msg.used_time) );				
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

var AIAgent = function(){
	hotjs.base(this);
	this.mycolor = 2;
	this.char_style = undefined;
};

hotjs.inherit(AIAgent, hotjs.Class, {
	init : function() {
		//try {
			// only through network, if local file, need embedded into html
			//worker = new Worker( __DIR__('ai_go.js') );
			//worker.onmessage = onAIMessage;
		//} catch(err) {
			// web worker is not supported by some browser, like Android 4.0.3 in HTC 328D 
			// we just simulate and run the logic in same thread
			hotjs.require( __DIR__('ai_go.js') );

			worker = {};
			worker.onmessage = onAIMessage;
			worker.postMessage = function(data){
				ai_go.onmessage({ data: data });
			};
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
			var peerN = 'peer' + app_data.opt.level;
			var npc = NPC_config[ peerN ];
			this.setCharStyle( {
				level: npc.level,
				think_time: npc.think_time,
				attack_factor: npc.attack_factor
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
	
	var npc_data = app_data.npc_data[ 'peer' + app_data.opt.level ];
	$('#peer-gold').text( npc_data.gold );
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
//var music_index = 1;
//function toggleMusic() {
//	var music_file = __DIR__('audio/music' + music_index + '.mp3');
//	if( app_data.opt.music ) {
//		resources.playAudio(music_file, false, true);
//		$('img#icon-music').attr('src', __DIR__('img/music.png') );
//	} else {
//		resources.stopAudio(music_file);
//		$('img#icon-music').attr('src', __DIR__('img/musicoff.png') );
//		music_index ++;
//		if(music_index > 3) music_index = 1;
//	}
//}

function toggleTip( b ) {
	if( b ) {
		board.showTip( true );

		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('tipon'), 
				'<p>' + hotjs.i18n.get('tipcost1gold') + '</p>',
				{ dismiss: 1500 }, {'top':'5px'}, 'top' );
		
		app_data.my.gold --;
		save_data();
		
		updateDataShow();

	} else {
		board.showTip( false );
		if( dialog ) { dialog.dismiss(); dialog=null; }
	}
	
	if( board.getTipStatus() ) {
		$('.icon-tip').attr('src', __DIR__("img/tipon.png") );
	} else {
		$('.icon-tip').attr('src', __DIR__("img/tipoff.png") );
	}
}

function payWithPaypalMPL( pkgid ) {
	if(! window.plugins) return;
	if(! window.plugins.PayPalMPL) return;	
	
	var ppm = window.plugins.PayPalMPL;

	var golds = apple_iap_products[ app_key + '.' + pkgid ].golds;
	var subTotal = hotjs.i18n.get( pkgid + '_subTotal' );
	var currency = hotjs.i18n.get( 'currency' );

	ppm.setPaymentInfo({
			'lang' : 'en_US',
			'paymentType' : ppm.PaymentType.TYPE_GOODS,
			'showPayPalButton': -1,
			'paymentCurrency' : currency,
			'subTotal' : subTotal,
			'recipient' : 'rnjsoft.mobile@gmail.com',
			'description' : 'game coins (' + golds + ')',
			'merchantName' : 'GomokuMist'
		}, function() {
			ppm.pay({}, function() {
				app_data.my.gold += golds;
				save_data();
				updateDataShow();
				
				if( dialog ) { dialog.dismiss(); dialog=null; }
				dialog = hotjs.domUI.popupDialog(hotjs.i18n.get('paydone'),
						"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
						hotjs.i18n.get('get500happy').replace('500', golds) + '</p>');
			}, function( msg ) {
				if( dialog ) { dialog.dismiss(); dialog=null; }
				dialog = hotjs.domUI.popupDialog( hotjs.i18n.get('payfailed'), 
						hotjs.i18n.get('payfailed_retrylater'));
			});
		}, function() {
			if( dialog ) { dialog.dismiss(); dialog=null; }
			dialog = hotjs.domUI.popupDialog( hotjs.i18n.get('payfailed'), 
					hotjs.i18n.get('payfailed_retrylater'));
		});
}

function requestIAPProductInfo() {
	var iap = window.plugins.InAppPurchaseManager;
	var productIds = [];
	for( var k in apple_iap_products ) {
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
					apple_iap_products[ k ].valid = false;
				}
			}
			
		}, function() {
			$('button#btn-iap').attr('disabled', 'disabled');
			
			window.setTimeout( requestIAPProductInfo, 1000 * 30 );
		}
	);	
}

function init_IAP() {
	if(! window.plugins) return;
	if(! window.plugins.InAppPurchaseManager) return;
	
	document.addEventListener('onInAppPurchaseSuccess', function(event){
		// event.productId
		// event.transactionId
		// event.transactionReceipt
		
		var product = apple_iap_products[ event.productId ];
		if(! product) return;
		
		app_data.my.gold += product.golds;
		save_data();
		updateDataShow();

		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog(hotjs.i18n.get('paydone'),
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
					hotjs.i18n.get('get500happy').replace('500', product.golds) + '</p>');
	});

	document.addEventListener('onInAppPurchaseFailed', function(event){
		// event.errorCode
		// event.errorMsg
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( hotjs.i18n.get('payfailed'), 
			hotjs.i18n.get('payfailed_retrylater'));
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
	
	var productId = app_key + '.' + pkgid;
	iap.makePurchase( productId, 1, function(){}, function(){} );
}

function buyProduct( productId ) {
    $('div#pagebuy').hide();

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
 		//hotjs.domUI.toggle( $('div#pagebuy')[0] );
		
		var imgs = {
				'pkg1' : __DIR__('img/gold2.png'),
				'pkg2' : __DIR__('img/gold3.png'),
				'pkg3' : __DIR__('img/gold4.png')
		};
		dialog = hotjs.domUI.popupDialog( 
				"<img class='icon96' src='" + imgs[productId] +  "'><br/>" +
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
	
	if( app_data.my.adclicks < 5 ) {
		app_data.my.gold += 5;
		
		app_data.my.adclicks ++;
		app_data.my.adtotal ++;
		app_data.my.adtime = now;

		save_data();
		updateDataShow();
	}	
}

    function togglePage( id ) {
        var scrw = $(window).width(), scrh = $(window).height();
        var o = $(id);
        var w = o.width(), h = o.height();
        o.css({'top': (scrh-h)/2 + 'px', 'left': (scrw-w)/2 + 'px'});
        hotjs.domUI.toggle( o[0] );
    }



    function popupNeedGoldDlg() {
	if( dialog ) { dialog.dismiss(); dialog=null; }
	dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get('nogold'), 
			"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
			+ hotjs.i18n.get('nogoldcannotdo') + '</p>', {
				'buy':function(){
					hotjs.domUI.dismiss( dialog );
                    //$('div#pagebuy').show();
                    togglePage('div#pagebuy');
					//hotjs.domUI.toggle( $('div#pagebuy')[0] );
					return true;
				}
			} );	
}

function showWelcomeDlg() {
	if( dialog ) { dialog.dismiss(); dialog=null; }
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
			" ( " + Math.round(my_winrate * 100) + "% )</td></tr>" +
			"<tr><td>" + hotjs.i18n.get('name') + "</td><td class='m'><input class='round m' id='myname' size=24 value='"+ app_data.my.name + "'/></td></tr>" +
			"<tr><td>" + hotjs.i18n.get('email') + "</td><td class='m'><input class='round m' id='myemail' size=24 value='"+ app_data.my.email + "'/></td></tr>" +
			"<tr><td>" + hotjs.i18n.get('twitter') + "</td><td class='m'><input class='round m' id='mytwitter' size=24 value='"+ app_data.my.twitter + "'/></td></tr>" +
			"<tr><td>" + hotjs.i18n.get('facebook') + "</td><td class='m'><input class='round m' id='myfacebook' size=24 value='"+ app_data.my.facebook + "'/></td></tr>" +
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
			});
}

function init_events() {
	$(window).resize( game_resize );
	
	$('.clickable').on(touch_event, function(){
		resources.playAudio( __DIR__('audio/click.mp3'), true );
	});
	
	// iAd
	document.addEventListener( 'onClickAd', watchAdGetGift );
	
	// AdMob
	document.addEventListener( 'onPresentAd', watchAdGetGift );
	document.addEventListener( 'onLeaveToAd', watchAdGetGift );
	
	$('.icon-start').on('click', function(){
		var step_count = board.getStepCount() / 2;
		if( board.gameOver || (step_count < 1) ){
			restartGame();
			
		} else if ( step_count >= 30 ) {
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('giveup'),
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
					hotjs.i18n.get('confirmtie').replace('30', step_count) + "</p>",
	 				{
						'ok' : function() {
							restartGame();
							return true;
						},
						'cancel' : function() {
							return true;
						}
					});	
			
		} else {
			var peerN = 'peer' + app_data.opt.level;
			var npc = NPC_config[ peerN ];
			var npc_data = app_data.npc_data[ peerN ];
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('giveup'),
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
					hotjs.i18n.get('confirmgiveup').replace('20', step_count).replace('10', npc.perwin) + "</p>",
	 				{
						'ok' : function() {
							app_data.my.gold -= npc.perwin;
							app_data.my.total ++;
							npc_data.total ++;
							npc_data.win ++;
							npc_data.gold += npc.perwin;
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
	
	$('.icon-undo').on('click', function(){
		if( ! board.canUndo() ) {
			if( dialog ) { dialog.dismiss(); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('notstarted'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('notstartedcannotdo') + '</p>' );
		} else if( board.gameOver ) {
			if( dialog ) { dialog.dismiss(); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('gameover'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('gameovercannotdo') + '</p>' );
		} else if( board.canUndo() ) {
			if( app_data.my.gold >= 3 ) {
				board.undo();
				if( dialog ) { dialog.dismiss(); dialog=null; }
				dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('undook'), 
					"<p>" + hotjs.i18n.get('undocost3gold') + '</p>', 
					{}, {'top':'0px'}, 'top' );
				
				app_data.my.gold -= 3;
				save_data();
				updateDataShow();
			} else {
				popupNeedGoldDlg();
			}
		}
	});

	$('.icon-tip').on(touch_event, function(){
		if( ! board.canUndo() ) {
			if( dialog ) { dialog.dismiss(); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('notstarted'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('notstartedcannotdo') + '</p>' );
		} else if( board.gameOver ) {
			if( dialog ) { dialog.dismiss(); dialog=null; }
			dialog = hotjs.domUI.popupDialog( 
					hotjs.i18n.get('gameover'), 
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('gameovercannotdo') + '</p>' );
		} else if ( app_data.my.gold >= 1 ) {
			toggleTip(! board.getTipStatus() );
		} else {
			popupNeedGoldDlg();
		}
	});
	
    $('.pagemenu, .menu, .pagemenu_x').on('click' , function(){
        togglePage('div#pagemenu');
    });

    $('.pageopt, .pageopt_x').on('click', function(){
		togglePage('div#pageopt');
	});

	$('.pagebuy, .pagebuy_x').on('click', function(){
		togglePage('div#pagebuy');
	});

    $('.pagechar, .pagechar_x, .btn-char').on('click', function(){
        togglePage('div#pagechar');
    });

    $('button.btn-buy').on('click', function(){
		var productId = $(this).attr('id');
		buyProduct( productId );
	});

    $('.pageabout').on('click', function(){
        if( dialog ) { dialog.dismiss(); dialog=null; }
        dialog = hotjs.domUI.popupDialog(
                hotjs.i18n.get('gamename') + ', v' + app_version,
                "<table><tr><td class='m'><img class='icon128 round' src='" + __DIR__('img/icon256.png') +  "'><br/>" + hotjs.i18n.get('about_text') + "</td></tr></table>"
        );
    });

    $('button#btn_gamerule').on(touch_event, function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('gamerule'), 
				"<table><tr><td class='l'>" + hotjs.i18n.get('gamerule_text') + "</td></tr></table>"
				);
	});
	$('button#btn_gametip').on(touch_event, function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('gametip'), 
				"<table><tr><td class='l'>" + hotjs.i18n.get('gametip_text') + "</td></tr></table>"
				);
	});
	$('button#btn_welcome').on(touch_event, function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		showWelcomeDlg();
	});
	$('button#btn_yourinfo').on('click', function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		showPlayerInfoDlg();
	});
	$('button#btn_toplist').on('click', function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('toplist'), 
				"<table>" + 
				"<tr><td><button id='btn_topgold' class='dialog button yellow'>" + hotjs.i18n.get('topgold') + "</button></td>" +
				"<td><button id='btn_topwin' class='dialog button green'>" + hotjs.i18n.get('topwin') + "</button></td>" +
				"<td><button id='btn_toprate' class='dialog button cyan'>" + hotjs.i18n.get('toprate') + "</button></td><tr>" + 
				"<tr><td colspan=3>" + hotjs.i18n.get('comingsoon') + "</td></tr>" +
				"</table>" );
	});

	function genBriefInfo( char_id ) {
		var peerN = 'peer' + char_id;
		var npc = NPC_config[ peerN ];
		return "<img src='" + __DIR__('img/peer' + char_id + '-128.png') + "'><p>" 
			+ hotjs.i18n.get('peer' + char_id + 'desc') + '</p><p>'
			+ hotjs.i18n.get('winlost10gold').replace('10', npc.perwin) + '</p>';
	}

	$('img#peer-img').on(touch_event, function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		var char_id = app_data.opt.level;
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get( 'peer' + char_id ), genBriefInfo( char_id ),
				{
					'selectpeer' : function() {
						togglePage('div#pagechar');
						return true;
					}
				});
	});
	
	$('img#my-img').on('click', function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		showPlayerInfoDlg();
	});

	$('img.btn-char').on('click', function(){
		var char_id = $(this).attr('v');
		var peerN = 'peer' + char_id;
		var npc = NPC_config[ peerN ];
		
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get(peerN),
				genBriefInfo( char_id ) + hotjs.i18n.get('confirmfight'),
 				{
					'ok' : function() {
						app_data.opt.level = char_id;
						save_data();
						
						ai_agent.setCharStyle( {
							level: npc.level,
							think_time: npc.think_time,
							attack_factor: npc.attack_factor
						});

						updateDataShow();
						
						hotjs.domUI.toggle( $('div#pageopt')[0] );
						return true;
					},
					'cancel' : function() {
                        $('div#pagechar').show();
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

	if( w>h ) {
		$('div#controlleft').css({ // right
			'display':'inline-block',
			'width': '',
			'height':'',
			'right':'',
			'left':'5px',
			'top':'',
			'bottom': (mh+5) + 'px'
		});
        $('div#controlright').css({ // right
            'display':'inline-block',
            'width': '',
            'height':'',
            'left':'',
            'right':'5px',
            'top':'',
            'bottom': (mh+5) + 'px'
        });
		
		var m = Math.min(w, h) - 2;
		board.setArea( (w-m)/2, (h-m)/2, m, m );
	} else {
		$('div#controlleft').css({ // bottom
			'display':'inline-block',
			'width':'',
			'height':'',
			'left':'5px',
			'right':'',
			'top':'',
			'bottom': (mh+5) + 'px'
		});
        $('div#controlright').css({ // bottom
            'display':'inline-block',
            'width':'',
            'height':'',
            'left':'',
            'right':'5px',
            'top':'',
            'bottom': (mh+5) + 'px'
        });

		var h_info = $('div#user1').height() + 10;
		var h_ctrl = $('div#controlleft').height();
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
"<div id='controlleft' class='control'>\
<table class='control' cellspacing='5'>\
<tr><td class='m vm btn clickable pagemenu'><img class='icon' src='" + __DIR__('img/menu.png') + "'/><span class='I18N' i18n='menu'>Menu</span></td></tr>\
<tr><td class='m vm btn clickable pagebuy'><img class='icon' src='" + __DIR__('img/gold.png') + "'/><span class='I18N' i18n='buy'>Coins</span></td></tr>\
</table></div>\
<div id='controlright' class='control'>\
<table class='control' cellspacing='5'>\
<tr><td class='m vm btn clickable icon-tip'><img class='icon' src='" + __DIR__('img/tipoff.png') + "'/><span class='I18N' i18n='tips'>Tips</span></td></tr>\
<tr><td class='m vm btn clickable icon-undo'><img class='icon' src='" + __DIR__('img/undo.png') + "'/><span class='I18N' i18n='undo'>Undo</span></td></tr>\
</table></div>";


    pagemain.innerHTML += packDialogHTML( 'pagemenu',
"<table>\
<tr><td><button class=' clickable menu button cyan icon-start' id='btn_new'><img class='icon' src='" + __DIR__('img/restart.png') + "'/> " + hotjs.i18n.get('new') + "</button></td></td>\
<tr><td><button class=' clickable menu button cyan pagechar' id='btn_char'><img class='icon' src='" + __DIR__('img/peer2-64.png') + "'/> " + hotjs.i18n.get('selectpeer') + "</button></td><tr>\
<tr><td><button class=' clickable menu button cyan pagebuy' id='btn_buy'><img class='icon' src='" + __DIR__('img/gold.png') + "'/> " + hotjs.i18n.get('buy') + "</button></td><tr>\
<tr><td><button class=' clickable menu button cyan pageopt' id='btn_options'><img class='icon' src='" + __DIR__('img/options.png') + "'/> " + hotjs.i18n.get('options') + "</button></td><tr>\
<tr><td><button class=' clickable menu button cyan pageabout' id='btn_about'><img class='icon' src='" + __DIR__('img/info.png') + "'/> " + hotjs.i18n.get('about') + "</button></td><tr>\
</table>" );

    pagemain.innerHTML += packDialogHTML( 'pagechar',
"<table class='m full'>\
<tr><td></td><td><span class='I18N' i18n='selectpeer'>Select</span></td><td class='r'></td></tr>\
<tr>\
<td><img class='btn-char icon64 clickable' v='1' src='" + __DIR__('img/peer1-64.png') +"'/><br/><span class='I18N' i18n='peer1'>Kid</span></td>\
<td></td><td><img class='btn-char icon64 clickable' v='3' src='" + __DIR__('img/peer3-64.png') +"'/><br/><span class='I18N' i18n='peer3'>Boy</span></td></tr>\
<tr><td></td><td><img class='btn-char icon64 clickable' v='2' src='" + __DIR__('img/peer2-64.png') +"'/><br/><span class='I18N' i18n='peer2'>Girl</span></td><td></td></tr>\
<tr><td><img class='btn-char icon64 clickable' v='4' src='" + __DIR__('img/peer4-64.png') +"'/><br/><span class='I18N' i18n='peer4'>Uncle</span></td>\
<td></td><td><img class='btn-char icon64 clickable' v='5' src='" + __DIR__('img/peer5-64.png') +"'/><br/><span class='I18N' i18n='peer5'>Grandpa</span></td>\
</tr><tr><td>&nbsp;</td></tr>\
</table>" );

    pagemain.innerHTML += packDialogHTML( 'pageopt',
"<table class='m full'>\
<tr><td colspan=4 style='text-align:left'><span  class='I18N' i18n='boardsize'>Board Size</span></td></tr>\
<tr>\
<td><button class='btn-size clickable set button rosy' v='11'>11</button></td>\
<td><button class='btn-size clickable set button yellow' v='13'>13</button></td>\
<td><button class='btn-size clickable set button green' v='15'>15</button></td>\
<td><button class='btn-size clickable set button cyan' v='17'>17</button></td>\
<td><button class='btn-size clickable set button blue' v='19'>19</button></td>\
</tr>\
<!--tr>\
<td style='text-align:right'><span  class='I18N' i18n='music'>Music</span></td>\
<td><img id='icon-music' class='icon clickable' src='" + __DIR__('img/music.png') + "' width='32'></td>\
<td colspan=2 style='text-align:right'><span  class='I18N' i18n='ad'>Ad</span></td>\
<td><img id='icon-ad' class='icon clickable' src='" + __DIR__('img/ad.png') + "' width='32'></td>\
</tr-->\
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
<tr><td><img class='icon32' src='" + __DIR__('img/gold.png') +"'/></td><td class='l I18N' i18n='pkg0'>100 golds</td><td><button id='pkg0' class=' clickable button cyan btn-buy I18N' i18n='pkg0price'>Get It</button></td></tr>\
<tr><td><img class='icon48' src='" + __DIR__('img/gold2.png') +"'/></td><td class='l I18N' i18n='pkg1'>500 golds</td><td><button id='pkg1' class=' clickable button green btn-buy I18N' i18n='pkg1price'>$ 1</button></td></tr>\
<tr><td><img class='icon48' src='" + __DIR__('img/gold3.png') +"'/></td><td class='l I18N' i18n='pkg2'>2000 golds</td><td><button id='pkg2' class=' clickable button yellow btn-buy I18N' i18n='pkg2price'>$ 2</button></td></tr>\
<tr><td><img class='icon48' src='" + __DIR__('img/gold4.png') +"'/></td><td class='l I18N' i18n='pkg3'>10000 golds</td><td><button id='pkg3' class=' clickable button gold btn-buy I18N' i18n='pkg3price'>$ 6</button></td></tr>\
</table>" );
}

if( window.plugins ) {
	if( isIOSDevice() ) {
		( using_iad ) ? init_iAd() : init_AdMob(); 
		init_IAP();
		//if(enable_paypal_in_ios) init_PayPalMPL();
	} else if ( isAndroidDevice() ) {
		init_AdMob();
		init_PayPalMPL();
	}	
}

var app = new hotjs.App();

function game_main() {
	
	load_data();
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
		.setBgImage( true, resources.get(__DIR__('img/woodfloor.jpg')) )
		.setMaxFps( 10 )
		.showFPS(false);

	ai_agent = new AIAgent().init();
	
	function playMoveSound( player ){
		if( player == 1 ) {
			resources.playAudio( __DIR__('audio/move2.mp3'), true );
		} else {
			resources.playAudio( __DIR__('audio/move.mp3'), true );
		}
	}
	
	board = (new GoBoard( app_data.opt.size ))
		.setSize(w, h).showGrid(false)
		.setColor("black").setGridStyle(true)
		.setAreaImage( true, resources.get(__DIR__('img/wood.jpg')) )
		.setGoImages( [ 
		               resources.get(__DIR__('img/blackgo.png')),
		               resources.get(__DIR__('img/whitego.png')),
		               resources.get(__DIR__('img/greengo.png')),
		               resources.get(__DIR__('img/highlight.png'))		               
		                ])
		.showImg(true)
		.setDraggable(true).setMoveable(true).setZoomable(true)
		.setPeerPlayer( ai_agent )
		.setJudge( ai_agent )
		.onGo( playMoveSound )
		.addTo( gameView )
		.resetGame();
	
	hotjs.i18n.translate();
	game_resize();
	updateDataShow();
	toggleAudio();
//	toggleMusic();
	
	app.addNode(gameView).start();

	var splash_time = 1500;
	var tLoadingDone = Date.now();
	var tUsed = tLoadingDone - tLoadingStart;
	var tWait = ( tUsed < splash_time ) ? (splash_time - tUsed) : 10; 
	window.setTimeout( function() {
		hotjs.domUI.showSplash( false );
		toggleAd();
//		if( ! app_data.opt.get_gift ) {
//			window.setTimeout( showWelcomeDlg, 2000 );		
//		}
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
   __DIR__('img/wood.jpg'),
   __DIR__('img/woodfloor.jpg'),
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
			"<h1 class='I18N' i18n='gamename'>GOMOKU</h1><img class='logo' src='" + __DIR__('img/icon256.png') + "'/><h3>&copy; RjFun</h3>",
			{'background':'white'} );

//	resources.preloadMusic([ 
//	                        __DIR__('audio/music1.mp3'), 
//	                        __DIR__('audio/music2.mp3'), 
//	                        __DIR__('audio/music3.mp3') 
//	                        ]);
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

