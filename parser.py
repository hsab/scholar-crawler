# %%
import os
import time
import random
import json
import unicodedata
import requests
import argparse
import socket
import re
import requests
import bibjson
import urllib.parse as urlparse
from urllib.parse import parse_qs

from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException
from selenium.webdriver.common.keys import Keys

from config import *


def randdelay(a, b):
	time.sleep(random.uniform(a, b))


def randdelayzero(a):
	time.sleep(random.uniform(0, a))


def u_to_s(uni):
	return unicodedata.normalize('NFKD', uni).encode('ascii', 'ignore')

# %%


class Scraper(object):

	def __init__(self, br):
		self.db = {}
		self.browser = br
		self.minWait = 1
		self.maxWait = 3
		self.scrollWait = 2
		self.minYear = 2000
		self.maxYear = 2021
		self.setRange = True

	def addRangeToURL(self, url):
		if self.setRange:
			range = '&as_ylo={}&as_yhi={}'.format(self.minYear, self.maxYear)
			url = url + range
		return url

	def loadDB(self):
		self.setupDir()
		dbPath = os.path.join(self.setupDir(), 'db.json')

		if os.path.isfile(dbPath):
			with open(dbPath) as outfile:
				self.db = json.load(outfile)

	def saveDB(self):
		dbPath = os.path.join(self.setupDir(), 'db.json')

		with open(dbPath, 'w') as outfile:
			json.dump(self.db, outfile, sort_keys=True, indent=4)

	def setupDir(self):
		dirPath = os.path.join(os.getcwd(), 'Data')
		os.makedirs(dirPath, exist_ok=True)
		return dirPath

	def goUrl(self, u):
		self.browser.get(u)
		randdelay(self.minWait, self.maxWait)

	def goBack(self, iter=1):
		for i in range(0, iter):
			self.browser.execute_script("window.history.go(-1)")
			randdelay(self.minWait, self.maxWait)

	def scroll(self):
		dummy = self.browser.find_element_by_tag_name('body')
		for i in range(random.randint(1, 10)):
			dummy.send_keys(Keys.ARROW_DOWN)
			randdelayzero(self.scrollWait)

	def getRelated(self):
		ignoreSource = self.browser.find_element_by_xpath(
			'//*[@id="gs_res_ccl_mid"]')
		related = ignoreSource.find_elements_by_xpath('.//*[@class="gs_ri"]')
		return related

	def parseTitle(self, elem):
		titleElem = elem.find_element_by_xpath('.//*[@class="gs_rt"]')

		# title= titleElem.text
		href = ''
		gsid = ''
		try:
			link = titleElem.find_element_by_tag_name('a')
			href = link.get_attribute('href')
			gsid = link.get_attribute('id')
		except:
			span = titleElem.find_element_by_xpath('(.//span)[last()]')
			gsid = span.get_attribute('id')

		ret = {
			"link": href,
			"gs_id": gsid,
			"cited_by": [],
			"refs": []
		}

		return ret

	def grabGSUrl(self, elem):
		currentURL = self.browser.current_url
		if 'cluster' in currentURL:
			return currentURL.split('cluster=')[1].split('&')[0]
		else:
			try:
				xp = ".//*[contains(@class, 'gs_fl')]//a[contains(text(), 'Cited')]"
				link = elem.find_element_by_xpath(xp).get_attribute('href')
				return link.split('cites=')[1].split('&')[0]
			except:
				pass
			try:
				xp = ".//*[@class='gs_rt']"
				link = elem.find_element_by_xpath(
					xp).find_element_by_tag_name('a').get_attribute('data-clk')
				return link.split('&d=')[1].split('&')[0]
			except:
				return ''

	def getNextPage(self):
		try:
			xp = "//*[@id='gs_n']//td[last()]//*[contains(text(), 'Next')]/.."
			link = self.browser.find_element_by_xpath(xp).get_attribute('href')
			return link
		except:
			return ''

	def getPreviousPage(self):
		try:
			xp = "//*[@id='gs_n']//td[1]//*[contains(text(), 'Previous')]/.."
			link = self.browser.find_element_by_xpath(xp).get_attribute('href')
			return link
		except:
			return ''

	def hasNextPage(self):
		return self.getNextPage() != ''

	def hasPreviousPage(self):
		return self.getPreviousPage() != ''

	def parseBib(self, elem):
		id = elem['gs_id']
		href = citationURL.format(id)
		self.goUrl(href)
		bibHref = self.browser.find_element_by_xpath(
			'//*[contains(text(),"BibTeX")]').get_attribute('href')
		self.goUrl(bibHref)
		bibText = self.browser.find_element_by_xpath('//*[text()]').text
		bibj = bibjson.collection_from_bibtex_str(bibText, collection="")
		bibj = dict(bibj["records"][0])
		self.goBack(2)
		return bibj

	def populateURLS(self, elem):
		gsid = elem['gs_id']
		cite_url = elem['cite_url']
		url = {
			'urls':{
				'cluster': self.addRangeToURL(clusterURL.format(cite_url)),
				'cites': self.addRangeToURL(citesURL.format(cite_url)),
				'citations': self.addRangeToURL(citationURL.format(gsid)),
				'related': self.addRangeToURL(realtedURL.format(gsid))
			}
		}
		return url

	def getCitationCount(self, elem):
		try:
			xp = ".//*[contains(@class, 'gs_fl')]//a[contains(text(), 'Cited')]"
			link = elem.find_element_by_xpath(xp).text
			c = link.split("Cited by ")[1]
			return int(c)
		except:
			pass
		return 0

	def getItemObj(self, idx=0):
		t = self.getRelated()

		item = self.parseTitle(t[idx])

		if not self.isInDB(item):
			item["cite_url"] = self.grabGSUrl(t[idx])
			item["citation_count"] = self.getCitationCount(t[idx])


			bib = self.parseBib(item)
			item.update(bib)

			# url = self.populateURLS(item)
			# item.update(url)
			self.addToDB(item)
			print(item)
			self.scroll()
			return item
		else:
			return self.getFromDB(item)

	def getTopItem(self):
		top = self.browser.find_element_by_xpath('//*[@id="gs_res_ccl_top"]')
		header = top.find_element_by_xpath('.//*[@class="gs_rt"]')
		link = header.find_element_by_tag_name('a').get_attribute('href')
		self.goUrl(link)
		iobj = self.getItemObj()
		self.goBack()
		return iobj

	def getCitingElements(self):
		related = self.getRelated()
		iterations = range(0, len(related))
		itemList = []
		for idx in iterations:
			t = self.getItemObj(idx)
			itemList.append(t)
		return itemList

	def getFromDB(self, elem):
		elemID = elem["gs_id"]
		if elemID in self.db:
			return self.db[elemID]

	def addToDB(self, elem):
		elemID = elem["gs_id"]
		if elemID not in self.db:
			self.db[elemID] = elem

	def isInDB(self, elem):
		elemID = elem["gs_id"]
		if elemID in self.db:
			return True
		return False

	def getDB(self):
		return self.db

	def addToCitedBy(self, elem, child):
		elemID = elem["gs_id"]
		self.db[elemID]["cited_by"].append(child["gs_id"])

	def addToRefs(self, elem, ref):
		elemID = elem["gs_id"]
		self.db[elemID]["refs"].append(ref["gs_id"])

	def parsePage(self, url):
		url = self.addRangeToURL(url)
		self.goUrl(url)
		parent = self.getTopItem()
		self.goUrl(url)

		itemList = self.getCitingElements()
		for i in itemList:
			self.addToCitedBy(parent, i)
			self.addToRefs(i, parent)

		self.saveDB()

	def close(self):
		self.browser.close()


# %%
chrome_options = webdriver.ChromeOptions()
chrome_options.add_argument('--no-sandbox')
# chrome_options.add_argument('--headless')
chrome_options.add_argument('--disable-dev-shm-usage')
browser = webdriver.Chrome(
	'/usr/lib/chromium/chromedriver', options=chrome_options)
randdelay(2, 4)

# %%
gs = Scraper(browser)
gs.loadDB()

gs.parsePage(startURL)
while gs.hasNextPage():
	nextUrl = gs.getNextPage()
	gs.parsePage(nextUrl)
print(gs.getDB())
gs.saveDB()

# %%


# %%
